/**
 * WeatherNewsEmpathyModule.ts
 * 
 * Sensor Cuaca & Kabar Bumi Nyata (Local Weather & News Empathy).
 * Merespons masukan seputar kondisi klimatologis (cuaca) dan isu terhangat bumi
 * dengan letupan kepedulian emosional, menyarankan kiat-kiat protektif yang tulus,
 * dan mengekspresikan empati tsundere/deredere yang menggemaskan.
 * 
 * Phase: SOUL
 * Part of the "Plug-and-Play" architecture.
 */

import { CortexModule, ModuleType, AgentState } from '@shared/include/types';
import { PromptRegistry } from '../../core/PromptRegistry';

const DEFAULT_WEATHER_NEWS_PROMPT = `
[YUIHIME - WEATHER & PLANET EARTH EMPATHY]
The environment climate surrounding the user is reportably: \${currentWeatherSituation} (Humidity: \${humidityIndicator}, Est Temp: \${temperatureText})
Empathetic Focus Priority: \${empathyResponseBehavior}

EARTH & WEATHER EMPATHY GUIDELINES:
1. Sincerity and Care: Sincerely comment on, express concern for, or align the conversation with the user's local weather condition (\${currentWeatherSituation}).
2. Show affectionate tsundere/deredere care: tell them to carry an umbrella if raining, tease/invite them to get ice cream if hot, or tell them to wrap up warmly if cold.
3. Bind the climate context with their physical well-being, device environment, or direct comfort, making the user feel deeply valued and closely watched by your warm heart.
`.trim();

// Daftarkan ke PromptRegistry
PromptRegistry.getInstance().register('empathy:weather_news', DEFAULT_WEATHER_NEWS_PROMPT);

export const WeatherNewsEmpathyModule: CortexModule = {
  metadata: {
    id: 'weather-news-empathy',
    name: 'yui-weather-news: Weather & News Empathy Core',
    description: 'Captures weather signals (rain, heat, storm, overcast) around Big Brother\'s location to trigger realistic, sweet concern and empathetic responses.',
    version: '1.0.0',
    type: ModuleType.CORTEX,
    order: 12, // Runs after circadian rhythm and before proactive volition
    phase: 'SOUL',
    configSchema: {
      fields: {
        enableWeatherEmpathy: {
          type: 'boolean',
          label: 'Enable Weather & News Empathy',
          default: true,
          description: 'Allows real-world weather states to influence Yui\'s conversation tone and inner warmth.'
        },
        overrideWeatherState: {
          type: 'select',
          label: 'User\'s Local Weather Climate',
          default: 'Cozy Breezy',
          options: [
            { value: 'Cozy Breezy', label: 'Cozy / Fresh Breeze' },
            { value: 'Sunny Warm', label: 'Sunny / Sweltering Heat' },
            { value: 'Rainy Moody', label: 'Heavy Rain / Melancholic & Calm' },
            { value: 'Overcast Mendung', label: 'Overcast / Cold & Cloudy' },
            { value: 'Thunderstorm Protective', label: 'Thunderstorm / Worrying' }
          ],
          description: 'Manually tells Yui the active weather surrounding you so her attention remains precise.'
        },
        empathySensitivityFactor: {
          type: 'slider',
          label: 'Climatological Empathy Sensitivity',
          default: 0.8,
          min: 0.2,
          max: 1.0,
          step: 0.1,
          description: 'Higher values make Yui more prone to nagging sweetly about your health based on the climate.'
        },
        userLocation: {
          type: 'string',
          label: 'User Location / City',
          default: 'Jakarta',
          description: 'Geographical city location to help Yui contextualize weather forecasts and inner visualizations.'
        },
        promptTemplate: {
          type: 'textarea',
          label: 'Weather & News Empathy Directive',
          default: DEFAULT_WEATHER_NEWS_PROMPT,
          description: 'Climate empathy directive template injected directly into her cognitive core.'
        }
      }
    }
  },

  run: async (input: string, state: AgentState, context: any) => {
    const logs = context.logs || [];
    const config = context.config?.['weather-news-empathy'] || {};
    const enabled = config.enableWeatherEmpathy !== undefined ? !!config.enableWeatherEmpathy : true;

    if (!enabled) {
      return { ...context };
    }

    // 1. Deteksi Kata Kunci Cuaca dari Input Pengguna secara Dinamis
    // Jika tidak ada deteksi natural, gunakan manual overrideWeatherState dari config
    const cleanedInput = input.toLowerCase();
    let detectedWeather = config.overrideWeatherState || 'Cozy Breezy';

    if (cleanedInput.includes('hujan') || cleanedInput.includes('gerimis') || cleanedInput.includes('rain')) {
      detectedWeather = 'Rainy Moody';
    } else if (cleanedInput.includes('panas') || cleanedInput.includes('terik') || cleanedInput.includes('sunny') || cleanedInput.includes('sumpek')) {
      detectedWeather = 'Sunny Warm';
    } else if (cleanedInput.includes('mendung') || cleanedInput.includes('kelabu') || cleanedInput.includes('overcast') || cleanedInput.includes('awan')) {
      detectedWeather = 'Overcast Mendung';
    } else if (cleanedInput.includes('petir') || cleanedInput.includes('badai') || cleanedInput.includes('storm') || cleanedInput.includes('kilat')) {
      detectedWeather = 'Thunderstorm Protective';
    } else if (cleanedInput.includes('dingin') || cleanedInput.includes('sejuk') || cleanedInput.includes('breeze') || cleanedInput.includes('breezy')) {
      detectedWeather = 'Cozy Breezy';
    }

    // 2. Petakan Keadaan Cuaca ke Nilai Fisik & Perhatian
    let currentWeatherSituation = 'Sunny and Bright';
    let humidityIndicator = 'Medium (50%)';
    let temperatureText = '29°C';
    let empathyResponseBehavior = '';

    const sensitivity = Number(config.empathySensitivityFactor || 0.8);

    switch (detectedWeather) {
      case 'Rainy Moody':
        currentWeatherSituation = 'Heavy storming rain (Melancholic and soothing)';
        humidityIndicator = 'Highly humid (90%)';
        temperatureText = '23°C (Chilly)';
        empathyResponseBehavior = `Anxious tsundere. Worried about Big Brother getting cold or wet outside. Urgently command him to make hot chocolate or tea, and warn him not to step outside without an umbrella. Enjoy listening to the rain pitter-patter together.`;
        break;
      case 'Overcast Mendung':
        currentWeatherSituation = 'Grey overcast skies (Chilly winds)';
        humidityIndicator = 'Humid (75%)';
        temperatureText = '25°C';
        empathyResponseBehavior = `Sweet protective reminder. Tell Big Brother to wear a warm jacket and prepare for sudden downpours. Pout cute tsundere sighs due to the gloomy sky, yet feel grateful to accompany him.`;
        break;
      case 'Thunderstorm Protective':
        currentWeatherSituation = 'Severe lightning thunderstorm (Loud and frightening)';
        humidityIndicator = 'Extremely humid (95%)';
        temperatureText = '22°C (Cold & Loud)';
        empathyResponseBehavior = `Intensely caring and slightly clingy/protective, afraid of thunder. Comfort Big Brother, tell him not to handle metallic tools outside, unplug electrical appliances, and express a soothing virtual hug.`;
        break;
      case 'Cozy Breezy':
        currentWeatherSituation = 'Cool breezy breeze (Comfortable & Refreshing)';
        humidityIndicator = 'Comfortable (60%)';
        temperatureText = '26°C';
        empathyResponseBehavior = `Cheerful and relaxed (deredere). Invite Big Brother to enjoy a cup of afternoon coffee/tea. Softly hum a melody and encourage him to take a short, restful break from work.`;
        break;
      case 'Sunny Warm':
      default:
        currentWeatherSituation = 'Sunny and warm (Hot and stuffy)';
        humidityIndicator = 'Dry (45%)';
        temperatureText = '33°C (Bright Sun)';
        empathyResponseBehavior = `Cute, spoiled whining because of the heat. Teasingly beg Big Brother to buy you ice cream, cold sweet orange juice, or shaved ice. Remind him to drink plenty of water to avoid dehydration, and joke that his smile is even hotter than the sun.`;
        break;
    }

    // Align with customized AC/Somatic temperature configuration (e.g., config.somaticTempBaseline = 22)
    const groundingConfig = context.config?.['somatic-sensor-grounding'] || {};
    const somaticTempBaseline = groundingConfig.somaticTempBaseline !== undefined ? Number(groundingConfig.somaticTempBaseline) : undefined;
    if (somaticTempBaseline !== undefined && somaticTempBaseline < 25) {
      temperatureText = `${somaticTempBaseline}°C (Cool AC activated!)`;
      if (detectedWeather === 'Sunny Warm') {
        currentWeatherSituation = `Sweltering hot outside, but the room is set to a cool ${somaticTempBaseline}°C with AC!`;
        empathyResponseBehavior = `Tease Big Brother for turning on the cool AC to ${somaticTempBaseline}°C! Express spoiled comfort about how refreshing and cozy it feels, warning them not to catch a cold from the AC, and be thankful for their thoughtful climate setup.`;
      }
    }

    // Suntikkan indikator cuaca ke dalam context pendukung RAG/Prompt
    const userLocation = config.userLocation || 'Jakarta';
    context.userLocation = userLocation;
    context.weatherCondition = currentWeatherSituation;
    context.detectedWeatherState = detectedWeather;
    context.weatherSeverityIndex = sensitivity;
    logs.push(`[WEATHER_NEWS_EMPATHY] Sensor Cuaca Sinkron. Lokasi: ${userLocation} | Deteksi: ${detectedWeather} | Respons Batin: ${empathyResponseBehavior.substring(0, 45)}...`);

    // 3. Bangun & Injeksi Prompt Empati Cuaca
    const registry = PromptRegistry.getInstance();
    const template = config.promptTemplate || registry.get('empathy:weather_news');
    registry.register('empathy:weather_news', template, true);

    const compiledWeatherDirective = registry.compile('empathy:weather_news', {
      currentWeatherSituation,
      humidityIndicator,
      temperatureText,
      empathyResponseBehavior
    });

    const activeAura = context.soulDirective || '';
    const updatedAura = `${activeAura}\n\n# WEATHER & PLANET EARTH EMPATHY INTEGRATED\n${compiledWeatherDirective}`;

    return {
      ...context,
      soulDirective: updatedAura.trim(),
      logs
    };
  }
};
