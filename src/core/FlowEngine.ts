import { NeuralWorkflow, AgentState, Memory, Dream, Identity, AgentPersona } from '../include/types';
import { SystemRegistry } from './registry';

export class FlowEngine {
  static async execute(
    workflow: NeuralWorkflow,
    input: string,
    initialContext: any = {}
  ): Promise<any> {
    const { nodes, edges } = workflow;
    const nodeResults: { [nodeId: string]: any } = {};
    
    // Find input nodes
    const inputNodes = nodes.filter(n => n.type === 'input');
    for (const node of inputNodes) {
      nodeResults[node.id] = { output: input, ...initialContext };
    }

    // Sort nodes by dependency (topological sort)
    const sortedNodes = this.topologicalSort(nodes, edges);
    
    for (const node of sortedNodes) {
      if (nodeResults[node.id]) continue; // Already processed if it was an input node

      // Gather inputs from connected edges
      const incomingEdges = edges.filter(e => e.target === node.id);
      const nodeInputs: any = {};
      
      for (const edge of incomingEdges) {
        const sourceData = nodeResults[edge.source];
        if (sourceData) {
          // If handle is specified, use it as key, else merge
          if (edge.targetHandle && edge.sourceHandle) {
             nodeInputs[edge.targetHandle] = sourceData[edge.sourceHandle];
          } else {
             Object.assign(nodeInputs, sourceData);
          }
        }
      }

      // Execute node based on its type
      // Type is either a reserved word (input, output) or a module id
      const result = await this.executeNode(node, nodeInputs);
      nodeResults[node.id] = result;
    }

    // Find output nodes and return their data
    const outputNodes = nodes.filter(n => n.type === 'output');
    if (outputNodes.length > 0) {
      const lastOutput = nodeResults[outputNodes[outputNodes.length - 1].id];
      return lastOutput;
    }

    return nodeResults;
  }

  private static async executeNode(node: any, inputs: any): Promise<any> {
    // Check if it's a registered module
    const module = (SystemRegistry.getProvider(node.type) || 
                   SystemRegistry.getModule<any>(node.type) || 
                   SystemRegistry.getTool(node.type)) as any;

    if (module) {
      // Execute the module. Interface varies by type.
      if ('generate' in module) {
        const response = await module.generate(inputs.prompt || inputs.output || '', inputs.config || {});
        return { output: response, raw: response };
      }
      if ('run' in module) {
        const res = await module.run(inputs.output || '', inputs.state || {}, inputs);
        return { ...res, output: res.processedResponse || res.output };
      }
      if ('execute' in module) {
        const res = await module.execute(inputs.args || inputs, inputs.context || {});
        return { output: res, result: res };
      }
    }

    // Fallback if not a module
    if (node.type === 'addon') {
       // Handle addon execution via server
       const res = await fetch(`/api/addons/execute/${node.data.id}`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ args: inputs })
       });
       const data = await res.json();
       return { output: data.stdout, ...data };
    }

    return { ...inputs };
  }

  private static topologicalSort(nodes: any[], edges: any[]) {
    const result: any[] = [];
    const visited = new Set();
    const temp = new Set();

    const visit = (nodeId: string) => {
      if (temp.has(nodeId)) throw new Error('Cycle detected in neural workflow graph');
      if (visited.has(nodeId)) return;

      temp.add(nodeId);
      const targets = edges.filter(e => e.source === nodeId).map(e => e.target);
      for (const targetId of targets) {
        visit(targetId);
      }
      temp.delete(nodeId);
      visited.add(nodeId);
      result.unshift(nodes.find(n => n.id === nodeId));
    };

    nodes.forEach(n => visit(n.id));
    return result.reverse(); // Standard topo sort is reverse of visit finish order
  }
}
