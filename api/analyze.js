export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { image, context, userDx } = req.body;

  if (!image?.data) {
    return res.status(400).json({ error: 'No image provided' });
  }

  const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (!allowed.includes(image.media_type)) {
    return res.status(400).json({ error: 'Please upload a JPEG or PNG image. HEIC files are not supported — convert first.' });
  }

  const system = `You are an expert academic dermatologist and medical educator. Analyze the clinical image and the learner's differential diagnosis. Return ONLY a valid JSON object with no markdown, no code fences, no explanation — just the raw JSON.

JSON shape:
{
  "confidence": "high" | "medium" | "low",
  "score": <integer 0-100>,
  "scoreFeedbackTitle": "<short title>",
  "scoreFeedbackText": "<2-3 sentences>",
  "differentials": [
    {
      "rank": 1,
      "name": "<diagnosis name>",
      "latinName": "<latin or alternate name, or empty string>",
      "probability": <integer 0-100>,
      "bullets": ["<high-yield board point, wrap buzzwords in @@like this@@>"],
      "tags": ["boards" | "treatment" | "emergency"]
    }
  ],
  "learnerDxMatches": [
    {
      "userDx": "<exactly as entered>",
      "matchStatus": "hit" | "close" | "miss",
      "note": "<one line feedback>"
    }
  ],
  "nextSteps": "<HTML string with workup steps, use <strong> for key terms>"
}

Rules:
- 4 to 6 differentials
- probabilities should sum to approximately 100
- exactly 3 bullets per differential, each under 20 words, high-yield board facts only
- wrap all board buzzwords and eponyms in @@double at-signs@@
- return ONLY the JSON object, nothing else`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: system,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: image.media_type,
                  data: image.data,
                },
              },
              {
                type: 'text',
                text: `Clinical Context:\n${context || 'None provided'}\n\nLearner's Differential:\n${userDx || 'None provided'}`,
              },
            ],
          },
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Anthropic error:', data);
      return res.status(response.status).json({ error: data.error?.message || 'API error' });
    }

    const text = data.content?.map(b => b.text || '').join('') || '';
    return res.status(200).json({ text });

  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
