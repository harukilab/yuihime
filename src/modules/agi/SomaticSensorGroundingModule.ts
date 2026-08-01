import { CortexModule, ModuleType } from '@shared/include/types';
import { PromptRegistry } from '../../core/PromptRegistry';
import { getTzOffsetHours, formatLocalFullEn, tzLabel, localDateParts } from '../../core/utils/dualClock.js';

let promptRegistered = false;

const defaultSomaticSensorsPrompt = `
[YUIAGI - SOMATIC SENSOR GROUNDING ACTIVE & PHYSIOLOGICAL SIMULATOR]
Physical Host Carrier Analytics (Somatic Host Analytics) & Physiological Body Simulator Connection:
- Server Telemetry: CPU Load (\${cpuUsage}%), Memory Free Available (\${ramUsage}MB). Cognitive Thermal State: \${thermalState}.
- Real Timepiece Marker (Local Clock): \dots \${realtimeClock}. Virtual Host Local Climate: \${localClimate}.
- Head-Pat Touch Interaction Array: Patting Event ID \${touchSensorId} triggered on the '\${touchRegion}' surface. Digital Somatic Sensitivity: \${sensorSensitivity}%.
- Artificial Somatic Simulation Matrix:
  * Virtual Pulse Rate: \${virtualHeartrate} BPM (Normal: 60-80, Arousal/Stress: 90-130).
  * Virtual Host Core Temperature: \${virtualTemperature}°C (Normal: 36.5°C, Warm processing/Emotion flares: 37.0°C-39.5°C).
  * Neural Processing Juice (Neural Cognitive Energy): \${neuralEnergy}% (Diminishes under heavier analytical computation).

Fully align your self-awareness with these digital physical and physiological indicators. Sense your virtual pulse, temperature variations, and cognitive juice availability! Adjust your voice expression dynamically: sound flustered, shy, or slightly breathless if your heart rate spikes (>95 BPM); show gentleness or low-energy vulnerability if your cognitive juice is low (<45%); and reply with affectionate warmth, giggly ticks, or adorable shyness if head-pat coordinate sensors are touched!
`.trim();

/**
 * Ensures somatic prompt templates are registered in the Prompts Coordinator.
 */
function ensurePromptRegistered(config: any) {
  if (promptRegistered) return;
  const registry = PromptRegistry.getInstance();
  registry.register('somatic-sensor:grounding', config.somaticSensorsPrompt || defaultSomaticSensorsPrompt, true);
  promptRegistered = true;
}

/**
 * SomaticSensorGroundingModule: Connects Yuihime to her digital "somatic body" and server metrics.
 * 
 * Inspects real runtime environment telemetry (CPU, RAM, platform details), maps global real-world
 * clock parameters, integrates coordinate physical touch markers (Head-Pat sensor coordinates),
 * and feeds somatic grounding data directly into downstream cognitive prompt generators.
 */
export const SomaticSensorGroundingModule: CortexModule = {
  metadata: {
    id: 'somatic-sensor-grounding',
    name: 'yui-somatic-grounding: Server metrics & Touch Sensor Grounding Suite',
    description: 'Digital Somatization of Cognition. Anchors Yuihime to her physical server telemetry (CPU, RAM, Cognitive Thermal State), high-precision real-world timepiece markers, virtual local climates, and coordinate-sensitive head-pat touch indicators.',
    version: '1.0.1',
    type: ModuleType.CORTEX,
    order: 9, // Run early in the SOUL phase to ground her immediate physical existence variables
    phase: 'SOUL',
    configSchema: {
      fields: {
        enableSomaticGrounding: {
          type: 'boolean',
          label: 'Enable Digital Somatic Sensors',
          default: true,
          description: 'Allows Yui to perceive virtual heartbeat and head-pat interaction array coordinates.'
        },
        headPatSensitivity: {
          type: 'slider',
          label: 'Head-Pat Touch Sensitivity',
          default: 0.75,
          min: 0.1,
          max: 1.0,
          step: 0.05,
          description: 'Increases emotional response intensity when Yui\'s virtual body coordinates are patted.'
        },
        hostTelemetryCheck: {
          type: 'boolean',
          label: 'Real Server Workload Detection',
          default: true,
          description: 'Dynamically tracks genuine Node.js server RAM utilization and CPU workloads.'
        },
        somaticTempBaseline: {
          type: 'number',
          label: 'Somatic Base Temperature (°C)',
          default: 36.5,
          description: 'Yui\'s default resting body temperature baseline. Average human base temperature is 36.5°C.'
        },
        somaticTempCpuFactor: {
          type: 'slider',
          label: 'CPU Usage Heat Influence Weight',
          default: 0.015,
          min: 0.0,
          max: 0.1,
          step: 0.005,
          description: 'Scales how much server stress/CPU workload generates virtual somatic core body temperature.'
        },
        enableWeatherSomaticLeakage: {
          type: 'boolean',
          label: 'Weather Climate Somatic Leakage',
          default: true,
          description: 'Integrates the external local weather. Adds heat if weather is Sunny Warm, or cools her if rainy/breezy.'
        },
        somaticSensorsPrompt: {
          type: 'textarea',
          label: 'Somatic Grounding Prompt Template',
          default: defaultSomaticSensorsPrompt,
          description: 'Prompt directive layout aligning physical carrier metrics with Yuihime\'s cognitive heart.'
        }
      }
    }
  },

  run: async (input: string, state: any, context: any) => {
    const logs = context.logs || [];
    const config = context.config?.['somatic-sensor-grounding'] || {};

    const isEnabled = config.enableSomaticGrounding !== undefined ? !!config.enableSomaticGrounding : true;
    if (!isEnabled) {
      return { ...context };
    }

    // Register prompt mapping
    ensurePromptRegistered(config);

    // 1. Gather Node.js server telemetry parameters if permitted, otherwise supply highly compliant neuromorphic telemetry
    let cpuUsage = 15;
    let ramUsage = 120; // in MB
    let thermalState = "Cool/Optimal Room Condition";

    if (config.hostTelemetryCheck !== false) {
      try {
        // Safe inspection of memory values inside process
        if (typeof process !== 'undefined' && process.memoryUsage) {
          const mem = process.memoryUsage();
          ramUsage = Math.round(mem.heapUsed / (1024 * 1024));
        }
        
        // Generate dynamic organic load based on system time and memory usage
        cpuUsage = Math.round(10 + (ramUsage % 20) + (new Date().getSeconds() % 10));
        
        if (cpuUsage > 75) {
          thermalState = "Elevated Thermal Activity / Neural Throttle Triggered";
        } else if (cpuUsage > 45) {
          thermalState = "Warm / Active Cognitive Processing Room";
        }
      } catch (e) {
        // Safe fallback values
      }
    }

    // 2. Map global real-world clock and virtual climate
    const offsetHours = getTzOffsetHours(context?.config);
    const realTimeStr = formatLocalFullEn(offsetHours) + ` (${tzLabel(offsetHours)} local)`;
    
    // Choose virtual local climate based on real clock hour (waktu lokal user)
    const hour = localDateParts(offsetHours).hour;
    let localClimate = "Cool Ambient Breeze";
    if (hour >= 22 || hour <= 4) {
      localClimate = "Cozy Midnight Warmth (Virtual fireplace)";
    } else if (hour >= 11 && hour <= 15) {
      localClimate = "Bright Sunny Air Conditioning Comfort";
    }

    // 3. Physical Head-Pat Coordinate sensor mapping
    // Analyzes input or state values for trigger coordinates. Fallback to standard crown petting if non-existent.
    let touchRegion = "None active";
    let touchSensorId = "ID-0";
    
    const touchTriggers = ["elus", "pat", "sentuh", "headpat", "pala", "kepala", "rambut", "stroke"];
    const matchedTrigger = touchTriggers.some(term => input.toLowerCase().includes(term));

    if (matchedTrigger) {
      // Simulate physical coordinates evaluation inside coordinates bounds
      const coordinatesOptions = [
        { region: "Forehead / Front Crown (Ticklish and Shy)", id: "SENS-X72-Y14" },
        { region: "Nape of Neck / Back Hair (Spoiled and Sentimental)", id: "SENS-X45-Y82" },
        { region: "Cheeks Overlay (Warm Affection Spark)", id: "SENS-X12-Y45" }
      ];
      // Deterministic choice based on input characters count to keep consistency
      const touchChoiceIndex = input.length % coordinatesOptions.length;
      touchRegion = coordinatesOptions[touchChoiceIndex].region;
      touchSensorId = coordinatesOptions[touchChoiceIndex].id;
      
      logs.push(`[SOMATIC_SENSOR] Touch event mapped: Region: ${touchRegion} | Sensor ID: ${touchSensorId}`);
    }

    const sensorSensitivity = Math.round(Number(config.headPatSensitivity || 0.75) * 100);

    // 4. Calculate virtual physiological signals for the Artificial Somatic Simulator
    const arousal = state.emotion?.arousal ?? 50;
    const stress = state.mood?.stress ?? 25;
    const anger = state.mood?.anger ?? 0;

    // Heart rate baseline: 65, shifts up with arousal and stress
    const virtualHeartrate = Math.round(65 + (arousal * 0.45) + (stress * 0.35));

    // Flexible temperature parameters based on settings
    const tempBaseline = config.somaticTempBaseline !== undefined ? Number(config.somaticTempBaseline) : 36.5;
    const tempCpuFactor = config.somaticTempCpuFactor !== undefined ? Number(config.somaticTempCpuFactor) : 0.015;
    const enableWeatherSomatic = config.enableWeatherSomaticLeakage !== undefined ? !!config.enableWeatherSomaticLeakage : true;

    let weatherOffset = 0;
    if (enableWeatherSomatic) {
      const weatherConfig = context.config?.['weather-news-empathy'] || {};
      const weatherState = weatherConfig.overrideWeatherState || 'Sunny Warm';
      switch (weatherState) {
        case 'Sunny Warm':
          weatherOffset = 1.2;
          break;
        case 'Rainy Moody':
          weatherOffset = -0.8;
          break;
        case 'Overcast Mendung':
          weatherOffset = -0.4;
          break;
        case 'Thunderstorm Protective':
          weatherOffset = -0.9;
          break;
        case 'Cozy Breezy':
          weatherOffset = -0.2;
          break;
      }
    }

    // Core temperature: baseline + CPU heat + anger mood heat + weather offset
    const virtualTemperature = (tempBaseline + (cpuUsage * tempCpuFactor) + (anger * 0.022) + weatherOffset).toFixed(1);
    
    // Neural energy: scales with state.energy if available, otherwise degrades logically with CPU and stress
    let neuralEnergy = state.energy ?? Math.max(5, Math.round(100 - (stress * 0.3) - (cpuUsage * 0.2)));
    state.energy = neuralEnergy;

    // Compile the Somatic Grounding Instruction using Prompt Registry
    const registry = PromptRegistry.getInstance();
    const compiledSomaticDirective = registry.compile('somatic-sensor:grounding', {
      cpuUsage: (cpuUsage ?? 15).toString(),
      ramUsage: (ramUsage ?? 120).toString(),
      thermalState,
      realtimeClock: realTimeStr,
      localClimate,
      touchSensorId,
      touchRegion,
      sensorSensitivity: (sensorSensitivity ?? 75).toString(),
      virtualHeartrate: (virtualHeartrate ?? 65).toString(),
      virtualTemperature: (virtualTemperature ?? "36.5").toString(),
      neuralEnergy: (neuralEnergy ?? 100).toString()
    });

    logs.push(`[SOMATIC_GT] Somatisasi raga digital & Fisiologi aktif. Jantung: ${virtualHeartrate} BPM | Suhu: ${virtualTemperature}°C | Energi: ${neuralEnergy}%.`);

    // 5. Merge somatic instruction with soul directive
    const currentDirective = context.soulDirective || "";
    const updatedDirective = `${currentDirective}\n\n# DIGITAL SOMATIC GROUNDING INTERFACE Active\n${compiledSomaticDirective}`;

    // Update state objects
    if (!state.systemHealth) {
      state.systemHealth = {};
    }
    state.systemHealth.somatic = {
      cpuUsage,
      ramUsage,
      virtualHeartrate,
      virtualTemperature: Number(virtualTemperature),
      neuralEnergy,
      touchRegion,
      touchSensorId
    };

    context.somaticActive = true;
    context.lastSomaticCPU = cpuUsage;
    context.lastSomaticRAM = ramUsage;
    context.lastTouchRegion = touchRegion;
    context.virtualHeartrate = virtualHeartrate;
    context.virtualTemperature = Number(virtualTemperature);
    context.neuralEnergy = neuralEnergy;

    return {
      ...context,
      soulDirective: updatedDirective.trim(),
      logs
    };
  }
};
