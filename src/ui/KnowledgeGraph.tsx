import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { Memory, Dream, CoreKnowledge } from '../include/types';

interface Node extends d3.SimulationNodeDatum {
  id: string;
  label: string;
  type: 'memory' | 'dream' | 'knowledge' | 'root';
  value?: number;
}

interface Link extends d3.SimulationLinkDatum<Node> {
  source: string;
  target: string;
  strength: number;
}

interface KnowledgeGraphProps {
  memories: Memory[];
  dreams: Dream[];
  knowledge: CoreKnowledge[];
}

export const KnowledgeGraph: React.FC<KnowledgeGraphProps> = ({ memories, dreams, knowledge }) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;

    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    const nodes: Node[] = [
      { id: 'root', label: 'NEURAL_CORE', type: 'root', x: width / 2, y: height / 2 }
    ];
    const links: Link[] = [];

    // Add Knowledge Nodes
    knowledge.forEach(k => {
      nodes.push({ id: `k-${k.id}`, label: k.topic, type: 'knowledge', value: k.confidence });
      links.push({ source: 'root', target: `k-${k.id}`, strength: 0.8 });
    });

    // Add Dream Nodes
    dreams.forEach(d => {
      nodes.push({ id: `d-${d.id}`, label: d.concept, type: 'dream', value: d.strength });
      // Connect dreams to knowledge if possible (simplified for now)
      links.push({ source: 'root', target: `d-${d.id}`, strength: 0.5 });
    });

    // Add recent Memory Nodes
    memories.slice(-20).forEach(m => {
      nodes.push({ id: `m-${m.id}`, label: m.content.substring(0, 20) + '...', type: 'memory', value: m.importance });
      // Connect memories to root
      links.push({ source: 'root', target: `m-${m.id}`, strength: 0.3 });
    });

    const svg = d3.select(svgRef.current);
    
    // Defensive clear - using native while loop is sometimes safer than selectAll("*").remove() in race conditions
    const svgNode = svgRef.current;
    if (svgNode) {
      while (svgNode.firstChild) {
        svgNode.removeChild(svgNode.firstChild);
      }
    }

    const simulation = d3.forceSimulation<Node>(nodes)
      .force("link", d3.forceLink<Node, Link>(links).id(d => d.id).distance(100))
      .force("charge", d3.forceManyBody().strength(-200))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius(50));

    const link = svg.append("g")
      .attr("stroke", "rgba(255, 255, 255, 0.05)")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke-width", d => d.strength * 2);

    const node = svg.append("g")
      .selectAll("g")
      .data(nodes)
      .join("g")
      .call(drag(simulation));

    node.append("circle")
      .attr("r", d => {
        if (d.type === 'root') return 20;
        if (d.type === 'knowledge') return 12;
        if (d.type === 'dream') return 8;
        return 5;
      })
      .attr("fill", d => {
        if (d.type === 'root') return "#f59e0b";
        if (d.type === 'knowledge') return "#3b82f6";
        if (d.type === 'dream') return "#ec4899";
        return "rgba(255, 255, 255, 0.2)";
      })
      .attr("filter", d => d.type === 'root' ? "blur(4px)" : "none");

    node.append("text")
      .attr("dx", 15)
      .attr("dy", 4)
      .text(d => d.label)
      .attr("fill", "rgba(255, 255, 255, 0.4)")
      .attr("font-size", d => d.type === 'root' ? "12px" : "9px")
      .attr("font-family", "JetBrains Mono, monospace")
      .style("pointer-events", "none");

    simulation.on("tick", () => {
      link
        .attr("x1", d => (d.source as any).x)
        .attr("y1", d => (d.source as any).y)
        .attr("x2", d => (d.target as any).x)
        .attr("y2", d => (d.target as any).y);

      node
        .attr("transform", d => `translate(${d.x},${d.y})`);
    });

    function drag(simulation: d3.Simulation<Node, undefined>) {
      function dragstarted(event: any) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        event.subject.fx = event.subject.x;
        event.subject.fy = event.subject.y;
      }
      
      function dragged(event: any) {
        event.subject.fx = event.x;
        event.subject.fy = event.y;
      }
      
      function dragended(event: any) {
        if (!event.active) simulation.alphaTarget(0);
        event.subject.fx = null;
        event.subject.fy = null;
      }
      
      return d3.drag<SVGGElement, Node>()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended);
    }

    return () => {
      simulation.stop();
    };
  }, [memories, dreams, knowledge]);

  return (
    <svg 
      ref={svgRef} 
      className="w-full h-full cursor-grab active:cursor-grabbing"
      style={{ overflow: 'visible' }}
    />
  );
};
