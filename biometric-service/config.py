from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

DETECTOR = BASE_DIR / "models" / "buffalo_l" / "det_10g.onnx"
RECOGNIZER = BASE_DIR / "models" / "buffalo_l" / "w600k_r50.onnx"
ANTISPOOF = BASE_DIR / "models" / "liveness" / "MiniFASNetV2.onnx"

DETECTION_THRESHOLD = 0.50
NMS_THRESHOLD = 0.40
