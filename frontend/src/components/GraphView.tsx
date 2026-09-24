import { useEffect, useRef } from 'react';
import cytoscape, { Core } from 'cytoscape';
import cola from 'cytoscape-cola';
import type { GraphElements } from '../types';

cytoscape.use(cola);

const NODE_COLORS: Record<string, string> = {
  PERSON: '#5b9bd5',
  PHONE: '#70ad47',
  VEHICLE: '#ed7d31',
  LOCATION: '#ffc000',
  ORGANIZATION: '#a855f7',
  BANK_ACCOUNT: '#e94f64',
  DATE: '#8a8a8a',
  EVENT: '#8a8a8a',
};

// Distinct-enough ring colors to distinguish detected communities at a
// glance; cycles if a case has more communities than swatches.
const COMMUNITY_COLORS = ['#f97316', '#22d3ee', '#a3e635', '#f472b6', '#facc15', '#818cf8', '#34d399', '#fb7185'];

function communityColor(communityId: number | string | null): string {
  if (communityId === null || communityId === undefined) return '#10151f';
  const n = typeof communityId === 'number' ? communityId : parseInt(String(communityId), 10) || 0;
  return COMMUNITY_COLORS[n % COMMUNITY_COLORS.length];
}

interface Props {
  data: GraphElements['elements'] | null;
  onNodeSelect?: (nodeId: string, entityType: string, label: string) => void;
  /** Node ids that should render dimmed (everything else stays highlighted).
   * Pass null/undefined to show the whole graph at full opacity. */
  dimmedIds?: Set<string> | null;
  /** Ring nodes by detected community and size them by PageRank once analytics has run. */
  showAnalytics?: boolean;
}

export default function GraphView({ data, onNodeSelect, dimmedIds, showAnalytics }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const cy = cytoscape({
      container: containerRef.current,
      elements: [],
      style: [
        {
          selector: 'node',
          style: {
            'background-color': (ele) => NODE_COLORS[ele.data('entityType')] ?? '#64748b',
            label: 'data(label)',
            color: '#e2e8f0',
            'font-size': 10,
            'text-valign': 'bottom',
            'text-margin-y': 4,
            width: 28,
            height: 28,
            'border-width': 2,
            'border-color': '#10151f',
          },
        },
        {
          selector: 'node.analytics',
          style: {
            'border-width': 3,
            'border-color': (ele) => communityColor(ele.data('communityId')),
            width: (ele) => 22 + Math.min(40, (ele.data('pagerank') || 0) * 120),
            height: (ele) => 22 + Math.min(40, (ele.data('pagerank') || 0) * 120),
          },
        },
        {
          selector: 'edge',
          style: {
            width: 1.5,
            'line-color': '#3a4557',
            'target-arrow-color': '#3a4557',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            label: 'data(label)',
            'font-size': 8,
            color: '#8fa1bd',
            'text-rotation': 'autorotate',
          },
        },
        {
          selector: 'node:selected',
          style: { 'border-color': '#ffffff', 'border-width': 3 },
        },
        {
          selector: '.dimmed',
          style: { opacity: 0.15 },
        },
      ],
      layout: { name: 'cola', animate: true, nodeSpacing: 40, edgeLength: 120 } as never,
      wheelSensitivity: 0.2,
    });

    cy.on('tap', 'node', (evt) => {
      const node = evt.target;
      onNodeSelect?.(node.data('id'), node.data('entityType'), node.data('label'));
    });

    cyRef.current = cy;
    return () => cy.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !data) return;
    cy.elements().remove();
    cy.add([...data.nodes, ...data.edges] as never);
    if (showAnalytics) {
      cy.nodes().addClass('analytics');
    }
    const layout = cy.layout({ name: 'cola', animate: true, nodeSpacing: 40, edgeLength: 120 } as never);
    // cola's simulation is async; fit the viewport once it settles rather
    // than leaving the camera at its default pan/zoom (which can leave every
    // node outside the visible area on a fresh graph).
    layout.on('layoutstop', () => cy.fit(undefined, 40));
    layout.run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    if (showAnalytics) {
      cy.nodes().addClass('analytics');
    } else {
      cy.nodes().removeClass('analytics');
    }
  }, [showAnalytics]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    if (!dimmedIds || dimmedIds.size === 0) {
      cy.elements().removeClass('dimmed');
      return;
    }
    cy.nodes().forEach((node) => {
      if (dimmedIds.has(node.data('id'))) {
        node.addClass('dimmed');
      } else {
        node.removeClass('dimmed');
      }
    });
  }, [dimmedIds]);

  return <div ref={containerRef} className="w-full h-full min-h-[500px]" />;
}
