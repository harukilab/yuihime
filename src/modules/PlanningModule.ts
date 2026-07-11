import { CortexModule, ModuleType, TaskPlan } from '../include/types';

export const PlanningModule: CortexModule = {
  metadata: {
    id: 'task-planning',
    name: 'Neural Planning Engine',
    description: 'Analyzes and decomposes complex user requests into structured executable sub-tasks.',
    version: '1.2.0',
    type: ModuleType.CORTEX,
    order: 5,
    phase: 'PHASE 1: AGGREGATION'
  },
  run: async (input, state, context) => {
    const inputLower = (input || "").toLowerCase();

    // Reset/cancel any active plan if requested explicitly
    const wantsCancel = inputLower.includes('batal rencana') || 
                        inputLower.includes('cancel plan') || 
                        inputLower.includes('reset rencana') || 
                        inputLower.includes('reset plan') ||
                        inputLower.includes('clear plan');

    if (wantsCancel) {
      return { 
        ...context, 
        currentPlan: null,
        activePlan: undefined,
        requiresExecution: false
      };
    }

    // If we already have an active, incomplete plan, we progress the active task
    if (state.currentPlan && !state.currentPlan.isComplete) {
       const updatedPlan: TaskPlan = { 
         ...state.currentPlan, 
         tasks: state.currentPlan.tasks.map(t => ({ ...t })) 
       };
       
       const currentIndex = updatedPlan.currentTaskIndex;
       
       if (currentIndex < updatedPlan.tasks.length) {
         // Mark the current active task as completed
         updatedPlan.tasks[currentIndex].status = 'completed';
         
         // Move to the next task index
         const nextIndex = currentIndex + 1;
         updatedPlan.currentTaskIndex = nextIndex;
         
         if (nextIndex >= updatedPlan.tasks.length) {
           updatedPlan.isComplete = true;
         }
       } else {
         updatedPlan.isComplete = true;
       }

       return { 
         ...context, 
         currentPlan: updatedPlan,
         activePlan: updatedPlan,
         requiresExecution: true 
       };
    }

    // Heuristic analysis for complexity
    const complexIndicators = [
      'build', 'create', 'setup', 'analyze', 'search', 'compare', 'implement', 
      'how to', 'step by step', 'long term', 'organize', 'manage', 'solve',
      'multiple', 'various', 'sequence', 'process', 'project', 'program',
      'design', 'develop', 'research', 'explain in detail', 'comprehensive',
      'schedule', 'jadwal', 'remind', 'ingatkan', 'plan', 'rencana'
    ];
    
    const tokenCount = input.split(/\s+/).length;
    const hasComplexWord = complexIndicators.some(w => inputLower.includes(w));
    
    // Explicit request for planning
    const explicitPlanning = inputLower.includes('buat rencana') || 
                             inputLower.includes('buatlah rencana') ||
                             inputLower.includes('buat jadwal') ||
                             inputLower.includes('make a schedule') ||
                             inputLower.includes('create a plan') ||
                             inputLower.includes('generate a plan') ||
                             inputLower.includes('plan:');

    // Determine if planning is needed exclusively when explicitly requested by the user
    const requiresPlanning = explicitPlanning;

    if (requiresPlanning && !state.currentPlan) {
      return { 
        ...context,
        requiresPlanning: true,
        planning_intent: "DECOMPOSITION_REQUEST",
        planning_directive: "Break down this complex request into 3-5 distinct, manageable tasks. Return ONLY valid JSON.",
        planning_signal: `[PLANNER] Cognitive complexity detected. Initiating strategic decomposition buffer.`
      };
    }

    return { ...context };
  }
};
