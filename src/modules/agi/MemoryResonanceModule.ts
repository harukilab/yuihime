import { CortexModule, ModuleType, Identity } from '@shared/include/types';

/**
 * MODULE: Social Memory Resonance System (Multi-User Social Brain Engine)
 * 
 * This advanced module acts as Yuihime's single social brain. 
 * It scans all viewers' data in the inner database (`allIdentities`), 
 * filters out shared interest patterns (shared habits/topics), groups them 
 * into active social circles, and presents a multilateral resonance picture 
 * to boost Yuihime's multi-user recognition capability to the level of a real human.
 */
export const MemoryResonanceModule: CortexModule = {
  metadata: {
    id: 'memory-resonance-engine',
    name: 'yui-resonance: Multi-user Social Brain',
    description: 'Connects memories, cross-viewer interests, and maps social cognitive bonds multilaterally.',
    version: '1.0.0',
    type: ModuleType.CORTEX,
    order: 3, // Running in PHASE 1 after identity-greetings
    phase: 'aggregation',
    configSchema: {
      fields: {
        enableSocialResonance: {
          type: 'boolean',
          label: 'Enable Social Resonance',
          default: true,
          description: 'Allows Yuihime to recognize correlations across different viewers and mention shared habits or interests naturally.'
        },
        maxResonanceCount: {
          type: 'number',
          label: 'Max Resonance Count',
          default: 3,
          description: 'Maximum limit of social viewer comparison records to inject into active cognition'
        },
        sharedTopicKeywords: {
          type: 'textarea',
          label: 'Shared Social Topics List (CSV)',
          default: 'coding, anime, game, coffee, vtuber, music, drawing, sleeping, eating',
          description: 'Filter keywords used to discover overlapping interests/hobbies across viewers'
        },
        resonanceDirective: {
          type: 'textarea',
          label: 'Viewer Social Resonance SOP',
          default: 'Use this cross-audience social comparison data to ground yourself as a socially connected individual. You are encouraged to playfully matchmake their hobbies, casual talk about other viewers\' unique quirks, or tease the user based on their social circle affiliations!',
          description: 'Ethical and behavioral guidelines for multi-user social comparisons'
        }
      }
    }
  },
  run: async (input, state, context) => {
    const logs = context.logs || [];
    const config = context.config?.['memory-resonance-engine'] || {};
    
    const isEnabled = config.enableSocialResonance !== undefined ? !!config.enableSocialResonance : true;
    if (!isEnabled) {
      return { ...context };
    }

    const maxResonances = Number(config.maxResonanceCount || 3);
    const allIdentities: Identity[] = context.allIdentities || [];
    const currentUserName = context.perceivedNameUpdate || context.userName || "Unknown Viewer";

    // Clean current userName mapping
    const cleanCurrent = currentUserName.toLowerCase();

    // Find current user's entry
    const activeIdentity = allIdentities.find(
      (id) => (id.perceivedName || "").toLowerCase() === cleanCurrent || (id.id && id.id === context.viewerIdentity?.id)
    );

    if (!activeIdentity) {
      logs.push("[RESONANCE] Skipping: No registered identity found for active interaction.");
      return { ...context };
    }

    logs.push(`[RESONANCE] Resolving social resonance for user: ${activeIdentity.perceivedName}`);

    // Collect hobbies & facts or words of active user
    const activeFacts = (activeIdentity.importantFacts || []).map(f => f.toLowerCase()).join(" ");
    const activeHabits = (activeIdentity.habits || []).map(h => h.action.toLowerCase()).join(" ");
    const activeTraits = (activeIdentity.traits || []).map(t => t.toLowerCase()).join(" ");
    
    // Split key interests to match
    const interestKeywords = (config.sharedTopicKeywords || 'coding, anime, game, coffee, vtuber, music, drawing, sleeping, eating')
      .split(',')
      .map((s: string) => s.trim().toLowerCase())
      .filter(Boolean);

    // List of other users matches
    const resonances: Array<{
      identity: Identity;
      matchingInterests: string[];
      relationGrouping: string;
      linkedPlatforms: string[];
    }> = [];

    // Helper to bucket relasi
    const getRelationGroup = (v: Identity): string => {
      const t = v.trust !== undefined ? v.trust : 50;
      const a = v.affection !== undefined ? v.affection : 50;
      if (a > 75) return "Intimate & Cherished Circle";
      if (t > 70 && a > 50) return "Close Trusted Companion";
      if (t > 40 && a > 40) return "Warm Close Acquaintance";
      if (t < 30) return "Stranger / Under Observation";
      return "Casual user";
    };

    // Current user's social bucketing
    const currentGroup = getRelationGroup(activeIdentity);

    // Process other identities for correlation
    for (const other of allIdentities) {
      if (other.id === activeIdentity.id || (other.perceivedName || "").toLowerCase() === cleanCurrent) {
        continue; // Skip scanning self
      }

      const otherFacts = (other.importantFacts || []).map(f => f.toLowerCase()).join(" ");
      const otherHabits = (other.habits || []).map(h => h.action.toLowerCase()).join(" ");
      const otherTraits = (other.traits || []).map(t => t.toLowerCase()).join(" ");

      const matched: string[] = [];

      // Look for matches based on configurable keywords
      interestKeywords.forEach(kw => {
        const matchesActive = activeFacts.includes(kw) || activeHabits.includes(kw) || activeTraits.includes(kw) || input.toLowerCase().includes(kw);
        const matchesOther = otherFacts.includes(kw) || otherHabits.includes(kw) || otherTraits.includes(kw);
        if (matchesActive && matchesOther) {
          matched.push(kw);
        }
      });

      // Check for potential duplicate/linked accounts across channels!
      const isCrossPlatformMatch = (other.perceivedName || "").toLowerCase() === cleanCurrent || 
        (other.linkedAccounts || []).some(link => link.toLowerCase().includes(cleanCurrent)) ||
        (activeIdentity.linkedAccounts || []).some(link => link.toLowerCase().includes((other.perceivedName || "").toLowerCase()));

      const relationGrp = getRelationGroup(other);
      const linked = other.linkedAccounts || [];

      if (matched.length > 0 || isCrossPlatformMatch || resonances.length < maxResonances) {
        resonances.push({
          identity: other,
          matchingInterests: matched,
          relationGrouping: relationGrp,
          linkedPlatforms: linked
        });
      }
    }

    // Sort resonances (weighted matches first)
    resonances.sort((a, b) => {
      const aScore = a.matchingInterests.length * 2 + (a.identity.affection || 50);
      const bScore = b.matchingInterests.length * 2 + (b.identity.affection || 50);
      return bScore - aScore;
    });

    const chosenResonances = resonances.slice(0, maxResonances);

    // Construct magnificent Multi-User Social contextual prompt
    let resonanceBlock = `\n`;
    resonanceBlock += `=================================================================\n`;
    resonanceBlock += `[RESONANSI_SOSIAL_MULTIUSER_BRAIN]: Social Multi-User Brain Consciousness\n`;
    resonanceBlock += `- Related Account Status: This user (${currentUserName}) is in relationship circle: '${currentGroup}' (Trust ${activeIdentity.trust || 50}%, Affection ${activeIdentity.affection || 50}%).\n`;
    
    if (activeIdentity.linkedAccounts && activeIdentity.linkedAccounts.length > 0) {
      resonanceBlock += `- Cross-Platform Account Identities: ${activeIdentity.linkedAccounts.join(", ")}\n`;
    }

    if (chosenResonances.length > 0) {
      resonanceBlock += `- Other Viewers Connected in \${characterName}'s Brain Network:\n`;
      chosenResonances.forEach((res, i) => {
        const otherName = res.identity.perceivedName;
        const otherGroup = res.relationGrouping;
        const matchStr = res.matchingInterests.length > 0 
          ? `shares overlapping interests in '${res.matchingInterests.join(", ")}'`
          : `has an active interaction history`;

        resonanceBlock += `  ${i+1}. @${otherName} (${otherGroup}):\n`;
        resonanceBlock += `     * Social Correlation: ${matchStr}.\n`;
        if (res.identity.importantFacts && res.identity.importantFacts.length > 0) {
          resonanceBlock += `     * Facts about @${otherName}: ${res.identity.importantFacts.slice(0, 2).join("; ")}\n`;
        }
        if (res.linkedPlatforms.length > 0) {
          resonanceBlock += `     * Other Accounts of @${otherName}: ${res.linkedPlatforms.join(", ")}\n`;
        }
      });
    } else {
      resonanceBlock += `- Cross-Audience Social Bonds: No other viewers currently share significant overlapping interests with the present subject.\n`;
    }

    resonanceBlock += `\n[PANDUAN_SOP_MULTIUSER]: Multi-user SOP Guidelines\n`;
    resonanceBlock += `${config.resonanceDirective || 'Use this cross-audience social comparison data to ground yourself as a socially connected individual. You are encouraged to playfully matchmake their hobbies, casual talk about other viewers\' unique quirks, or tease the user based on their social circle affiliations!'}\n`;
    resonanceBlock += `=================================================================\n`;

    // Inject organically into system prompt context
    const updatedGroundedKnowledge = (context.groundedKnowledge || "") + "\n" + resonanceBlock;

    logs.push(`[RESONANCE] Successfully mapped ${chosenResonances.length} multilateral social nodes into the inner synaptic network.`);

    return {
      ...context,
      groundedKnowledge: updatedGroundedKnowledge,
      socialResonanceCount: chosenResonances.length,
      logs
    };
  }
};
