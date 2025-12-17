const axios = require('axios');

const EXIT_QUEUE_URL = process.env.EXIT_QUEUE_URL || 'https://www.validatorqueue.com/';

// Fallback data when network request fails
const FALLBACK_EXIT_QUEUE = {
  eth: 838850,
  wait: '14 days 14 hours',
  churn: '256/epoch',
  sweep_delay: '8.6 days'
};

async function getExitQueueInfo() {
  try {
    const response = await axios.get(EXIT_QUEUE_URL, { 
      timeout: 8000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    const html = response.data || '';

    // Find Exit Queue section
    const exitQueueSection = html.match(/Exit Queue[\s\S]*?<\/h5>/i);
    if (!exitQueueSection) {
      console.warn('Exit Queue section not found, using fallback');
      return FALLBACK_EXIT_QUEUE;
    }

    const section = exitQueueSection[0];

    // Extract ETH, Wait, Churn, Sweep Delay
    const ethMatch = section.match(/ETH:[\s\S]*?<span[^>]*>([\d,]+)<\/span>/i) || 
                     html.match(/Exit Queue[\s\S]*?ETH:[\s\S]*?<span[^>]*>([\d,]+)<\/span>/i);
    const waitMatch = section.match(/Wait:[\s\S]*?<span[^>]*>([^<]+)<\/span>/i) ||
                      html.match(/Exit Queue[\s\S]*?Wait:[\s\S]*?<span[^>]*>([^<]+)<\/span>/i);
    const churnMatch = section.match(/Churn:[\s\S]*?<span[^>]*>([^<]+)<\/span>/i) ||
                       html.match(/Exit Queue[\s\S]*?Churn:[\s\S]*?<span[^>]*>([^<]+)<\/span>/i);
    const sweepMatch = html.match(/Sweep Delay[^:]*:[\s\S]*?<span[^>]*>([^<]+)<\/span>/i);

    const parsed = {
      eth: ethMatch ? parseInt(ethMatch[1].replace(/,/g, ''), 10) : FALLBACK_EXIT_QUEUE.eth,
      wait: waitMatch ? waitMatch[1].trim() : FALLBACK_EXIT_QUEUE.wait,
      churn: churnMatch ? churnMatch[1].trim() : FALLBACK_EXIT_QUEUE.churn,
      sweep_delay: sweepMatch ? sweepMatch[1].trim() : FALLBACK_EXIT_QUEUE.sweep_delay
    };

    return parsed;
  } catch (err) {
    console.warn('Exit queue fetch failed, using fallback:', err.message);
    return FALLBACK_EXIT_QUEUE;
  }
}

module.exports = {
  getExitQueueInfo
};

