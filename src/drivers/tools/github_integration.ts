import { ToolModule } from '@shared/include/types';
import { SystemRegistry } from '@shared/core/registry';

const manifest = {
  "id": "github",
  "name": "GitHub Navigator",
  "description": "Interface with GitHub to search repositories, list issues, and fetch code metadata.",
  "version": "1.0.0",
  "type": "TOOL",
  "order": 200,
  "configSchema": {
    "fields": {
      "githubToken": {
        "type": "password",
        "label": "GitHub Personal Access Token",
        "description": "Used for authenticated requests to avoid rate limits",
        "default": ""
      },
      "defaultOwner": {
        "type": "string",
        "label": "Default Repository Owner",
        "description": "Fallback owner if not specified in query",
        "default": ""
      }
    }
  },
  "parameters": {
    "type": "object",
    "properties": {
      "action": { 
        "type": "string", 
        "enum": ["search_repos", "list_issues", "get_repo_details", "list_pull_requests"],
        "description": "The GitHub action to perform" 
      },
      "query": { "type": "string", "description": "Search query or repository name (e.g., 'owner/repo')" },
      "state": { "type": "string", "enum": ["open", "closed", "all"], "description": "Filter for issues/PRs" }
    },
    "required": ["action", "query"]
  }
} as const;

export const GitHubTool: ToolModule = {
  metadata: manifest as any,
  execute: async (args: any) => {
    try {
      const config = await SystemRegistry.getConfig('github');
      const token = config?.githubToken || process.env.GITHUB_TOKEN || '';
      const defaultOwner = config?.defaultOwner || '';
      const baseUrl = 'https://api.github.com';
      const headers: Record<string, string> = {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Yuihime-AI-Agent'
      };
      if (token) {
        headers['Authorization'] = `token ${token}`;
      }

      let endpoint = '';
      if (args.action === 'search_repos') {
        endpoint = `/search/repositories?q=${encodeURIComponent(args.query)}`;
      } else if (args.action === 'list_issues') {
        const repo = args.query.includes('/') ? args.query : `${defaultOwner}/${args.query}`;
        endpoint = `/repos/${repo}/issues?state=${args.state || 'open'}`;
      } else if (args.action === 'get_repo_details') {
        const repo = args.query.includes('/') ? args.query : `${defaultOwner}/${args.query}`;
        endpoint = `/repos/${repo}`;
      } else if (args.action === 'list_pull_requests') {
        const repo = args.query.includes('/') ? args.query : `${defaultOwner}/${args.query}`;
        endpoint = `/repos/${repo}/pulls?state=${args.state || 'open'}`;
      }

      const response = await fetch(`${baseUrl}${endpoint}`, { headers });
      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
      }
      const data = await response.json();
      
      return {
        success: true,
        action: args.action,
        data: Array.isArray(data) ? data.slice(0, 5) : data,
        summary: `Fetched ${args.action} for ${args.query}`
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
};
