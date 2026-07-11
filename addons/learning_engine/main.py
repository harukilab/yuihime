import sys
import json
import random
import os

class QLearningAgent:
    def __init__(self, learning_rate=0.1, discount_factor=0.9, epsilon=0.2):
        self.q_table = {}
        self.learning_rate = learning_rate
        self.discount_factor = discount_factor
        self.epsilon = epsilon
        self.actions = [
            "ShiftToneWarm",
            "ShiftToneAnalytical",
            "ShiftToneEnergetic",
            "IncreaseConfidence",
            "DecreaseConfidence",
            "UseDeepMemory",
            "UseSurfaceMemory"
        ]

    def _get_q(self, state, action):
        return self.q_table.get((state, action), 0.0)

    def get_best_action(self, state):
        if random.random() < self.epsilon:
            return random.choice(self.actions)
        
        max_q = float('-inf')
        best_action = self.actions[0]
        
        for action in self.actions:
            q = self._get_q(state, action)
            if q > max_q:
                max_q = q
                best_action = action
        
        return best_action

    def update(self, state, action, reward, next_state):
        current_q = self._get_q(state, action)
        
        max_next_q = max([self._get_q(next_state, a) for a in self.actions])
        
        # TD Update rule
        new_q = current_q + self.learning_rate * (reward + self.discount_factor * max_next_q - current_q)
        self.q_table[(state, action)] = new_q

    def save(self, path):
        # Convert keys to strings for JSON
        serializable_q = {f"{k[0]}|{k[1]}": v for k, v in self.q_table.items()}
        with open(path, 'w') as f:
            json.dump({
                "q_table": serializable_q,
                "learning_rate": self.learning_rate,
                "discount_factor": self.discount_factor,
                "epsilon": self.epsilon
            }, f)

    def load(self, path):
        if not os.path.exists(path):
            return
        with open(path, 'r') as f:
            data = json.load(f)
            self.learning_rate = data["learning_rate"]
            self.discount_factor = data["discount_factor"]
            self.epsilon = data["epsilon"]
            # Convert keys back to tuples
            self.q_table = {tuple(k.split('|')): v for k, v in data["q_table"].items()}

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No arguments provided"}))
        return

    try:
        args = json.loads(sys.argv[1])
        command = args.get("command")
        state_data = args.get("state", {})
        state = f"{state_data.get('mood_bucket', 'neutral')}|{state_data.get('energy_level', 2)}|{state_data.get('recent_context', 'social')}"
        
        storage_path = os.path.join(os.path.dirname(__file__), "q_table.json")
        agent = QLearningAgent()
        agent.load(storage_path)

        if command == "get_action":
            action = agent.get_best_action(state)
            print(json.dumps({"action": action}))
        
        elif command == "update":
            action = args.get("action")
            reward = args.get("reward", 0.0)
            next_state_data = args.get("next_state", {})
            next_state = f"{next_state_data.get('mood_bucket', 'neutral')}|{next_state_data.get('energy_level', 2)}|{next_state_data.get('recent_context', 'social')}"
            
            agent.update(state, action, reward, next_state)
            agent.save(storage_path)
            print(json.dumps({"success": True}))
        
        else:
            print(json.dumps({"error": f"Unknown command: {command}"}))

    except Exception as e:
        print(json.dumps({"error": str(e)}))

if __name__ == "__main__":
    main()
