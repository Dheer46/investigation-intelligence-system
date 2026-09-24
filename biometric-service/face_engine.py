import cv2
import numpy as np
import onnxruntime as ort

from config import (
    DETECTOR, RECOGNIZER, ANTISPOOF,
    DETECTION_THRESHOLD, NMS_THRESHOLD
)

# ArcFace 5-point template for 112x112.
ARCFACE_DST = np.array([
    [38.2946, 51.6963],
    [73.5318, 51.5014],
    [56.0252, 71.7366],
    [41.5493, 92.3655],
    [70.7299, 92.2041],
], dtype=np.float32)

class FaceEngine:
    def __init__(self):
        providers = ["CPUExecutionProvider"]

        if not DETECTOR.exists():
            raise FileNotFoundError(f"Missing detector: {DETECTOR}")
        if not RECOGNIZER.exists():
            raise FileNotFoundError(f"Missing recognizer: {RECOGNIZER}")
        if not ANTISPOOF.exists():
            raise FileNotFoundError(f"Missing anti-spoof model: {ANTISPOOF}")

        self.det = ort.InferenceSession(str(DETECTOR), providers=providers)
        self.rec = ort.InferenceSession(str(RECOGNIZER), providers=providers)
        self.spoof = ort.InferenceSession(str(ANTISPOOF), providers=providers)

        self.det_input = self.det.get_inputs()[0].name
        self.rec_input = self.rec.get_inputs()[0].name
        self.spoof_input = self.spoof.get_inputs()[0].name

        self.det_outputs = self.det.get_outputs()

    @staticmethod
    def _iou(a, b):
        ax1, ay1, ax2, ay2 = a
        bx1, by1, bx2, by2 = b
        ix1, iy1 = max(ax1, bx1), max(ay1, by1)
        ix2, iy2 = min(ax2, bx2), min(ay2, by2)
        iw, ih = max(0, ix2 - ix1), max(0, iy2 - iy1)
        inter = iw * ih
        area_a = max(0, ax2-ax1) * max(0, ay2-ay1)
        area_b = max(0, bx2-bx1) * max(0, by2-by1)
        return inter / (area_a + area_b - inter + 1e-8)

    def _nms(self, boxes, scores, threshold):
        order = np.argsort(scores)[::-1]
        keep = []
        while len(order):
            i = int(order[0])
            keep.append(i)
            order = np.array([
                j for j in order[1:]
                if self._iou(boxes[i], boxes[int(j)]) <= threshold
            ], dtype=np.int64)
        return keep

    def _decode_scrfd(self, outputs, width, height):
        # SCRFD det_10g ONNX: for each stride 8/16/32:
        # 2 score outputs, 2 bbox outputs, 2 landmark outputs.
        # Some exports order outputs as score,bbox,lmk per stride;
        # others group by type. Handle the common grouped form.
        arrays = [np.asarray(x) for x in outputs]

        scores_by_stride = []
        bbox_by_stride = []
        kps_by_stride = []

        # Grouped export: first 3 scores, next 3 bbox, last 3 landmarks.
        if len(arrays) >= 9:
            score_arr = arrays[:3]
            bbox_arr = arrays[3:6]
            kps_arr = arrays[6:9]
        else:
            # Interleaved fallback.
            score_arr, bbox_arr, kps_arr = [], [], []
            for i in range(0, len(arrays), 3):
                score_arr.append(arrays[i])
                bbox_arr.append(arrays[i+1])
                kps_arr.append(arrays[i+2])

        boxes, scores, kps = [], [], []
        strides = [8, 16, 32]

        for stride, sarr, barr, karr in zip(strides, score_arr, bbox_arr, kps_arr):
            s = np.asarray(sarr).reshape(-1)
            b = np.asarray(barr).reshape(-1, 4)
            k = np.asarray(karr).reshape(-1, 10)

            # 2 anchors per feature-map cell.
            fh, fw = height // stride, width // stride
            expected = fh * fw * 2

            if len(s) != expected:
                # If the export includes a singleton or alternate layout,
                # trim only when it is clearly compatible.
                n = min(len(s), len(b), len(k))
            else:
                n = expected

            s, b, k = s[:n], b[:n], k[:n]

            yy, xx = np.mgrid[0:fh, 0:fw]
            centers = np.stack([xx, yy], axis=-1).reshape(-1, 2).astype(np.float32) * stride
            centers = np.repeat(centers, 2, axis=0)[:n]

            inds = np.where(s >= DETECTION_THRESHOLD)[0]
            for idx in inds:
                cx, cy = centers[idx]
                x1 = cx - b[idx, 0] * stride
                y1 = cy - b[idx, 1] * stride
                x2 = cx + b[idx, 2] * stride
                y2 = cy + b[idx, 3] * stride

                x1 = float(np.clip(x1, 0, width-1))
                y1 = float(np.clip(y1, 0, height-1))
                x2 = float(np.clip(x2, 0, width-1))
                y2 = float(np.clip(y2, 0, height-1))

                kp = []
                for j in range(5):
                    kp.append([
                        float(cx + k[idx, 2*j] * stride),
                        float(cy + k[idx, 2*j+1] * stride)
                    ])

                boxes.append([x1, y1, x2, y2])
                scores.append(float(s[idx]))
                kps.append(kp)

        if not boxes:
            return []

        keep = self._nms(boxes, scores, NMS_THRESHOLD)
        return [(boxes[i], kps[i], scores[i]) for i in keep]

    def detect_all(self, image):
        h, w = image.shape[:2]

        # Correct SCRFD preprocessing for InsightFace det_10g:
        canvas = np.zeros((640, 640, 3), dtype=np.uint8)
        scale = min(640.0 / w, 640.0 / h)
        nw, nh = int(round(w * scale)), int(round(h * scale))
        resized = cv2.resize(image, (nw, nh))
        canvas[:nh, :nw] = resized

        blob = cv2.dnn.blobFromImage(
            canvas,
            scalefactor=1/128.0,
            size=(640, 640),
            mean=(127.5, 127.5, 127.5),
            swapRB=True
        )

        outputs = self.det.run(None, {self.det_input: blob})
        raw = self._decode_scrfd(outputs, 640, 640)

        result = []
        for box, kp, score in raw:
            # Convert detector coordinates back to original image.
            inv = 1.0 / scale
            box2 = [v * inv for v in box]
            kp2 = [[p[0] * inv, p[1] * inv] for p in kp]
            result.append((box2, kp2, score))

        result.sort(key=lambda x: x[2], reverse=True)
        return result

    def detect_single(self, image):
        faces = self.detect_all(image)

        # Security rule: exactly one sufficiently confident face.
        if len(faces) != 1:
            return None

        return faces[0]

    def align(self, image, landmarks):
        src = np.asarray(landmarks, dtype=np.float32)
        M, _ = cv2.estimateAffinePartial2D(src, ARCFACE_DST, method=cv2.LMEDS)
        if M is None:
            return None
        return cv2.warpAffine(image, M, (112, 112), borderValue=(0, 0, 0))

    def embedding(self, aligned):
        if aligned is None:
            return None

        # ArcFace ONNX is RGB and normalized around 127.5.
        rgb = cv2.cvtColor(aligned, cv2.COLOR_BGR2RGB)
        x = rgb.astype(np.float32)
        x = (x - 127.5) / 127.5
        x = np.transpose(x, (2, 0, 1))[None]

        out = self.rec.run(None, {self.rec_input: x})[0]
        e = np.asarray(out, dtype=np.float32).reshape(-1)

        n = np.linalg.norm(e)
        if n == 0:
            return None
        return e / n

    def liveness(self, image, box):
        # Silent-Face MiniFASNetV2 reference preprocessing:
        # expand face crop ~2.7x, resize 80x80, BGR float32 0..255,
        # NCHW, then softmax. Class 1 is live/real.
        x1, y1, x2, y2 = [float(v) for v in box]
        cx, cy = (x1+x2)/2, (y1+y2)/2
        bw, bh = (x2-x1), (y2-y1)
        side = max(bw, bh) * 2.7

        ax1 = max(0, int(round(cx-side/2)))
        ay1 = max(0, int(round(cy-side/2)))
        ax2 = min(image.shape[1], int(round(cx+side/2)))
        ay2 = min(image.shape[0], int(round(cy+side/2)))

        crop = image[ay1:ay2, ax1:ax2]
        if crop.size == 0:
            return 0.0

        crop = cv2.resize(crop, (80, 80), interpolation=cv2.INTER_LINEAR)
        x = crop.astype(np.float32)
        x = np.transpose(x, (2, 0, 1))[None]

        logits = np.asarray(
            self.spoof.run(None, {self.spoof_input: x})[0],
            dtype=np.float32
        )

        if logits.ndim != 2 or logits.shape[1] != 3:
            raise RuntimeError(
                f"Unexpected MiniFASNetV2 output shape: {logits.shape}; expected (1,3)"
            )

        logits -= np.max(logits, axis=1, keepdims=True)
        probs = np.exp(logits)
        probs /= np.sum(probs, axis=1, keepdims=True)

        return float(probs[0, 1])
