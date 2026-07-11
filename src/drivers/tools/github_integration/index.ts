import { ToolModule } from '../../../include/types';
import manifest from './manifest.json';

export const GitHubTool: ToolModule = {
  metadata: manifest as any,
  execute: async (args: any) => {
    try {
      const baseUrl = 'https://api.github.com';
      const headers = {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Yuihime-AI-Agent'
      };

      let endpoint = '';
      if (args.action === 'search_repos') {
        endpoint = `/search/repositories?q=${encodeURIComponent(args.query)}`;
      } else if (args.action === 'list_issues') {
        endpoint = `/repos/${args.query}/issues?state=${args.state || 'open'}`;
      } else if (args.action === 'get_repo_details') {
        endpoint = `/repos/${args.query}`;
      } else if (args.action === 'list_pull_requests') {
        endpoint = `/repos/${args.query}/pulls?state=${args.state || 'open'}`;
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
