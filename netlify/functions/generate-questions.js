/**
 * IntegrityAI — Smart Question Engine
 * Netlify Serverless Function — Google Gemini 2.0 Flash (free tier)
 * VERSION: GEMINI-4
 */

const QUESTION_GEN_PROMPT = `You are IntegrityAI's Smart Question Engine — an expert technical interviewer specialising in detecting AI-assisted interview cheating.

Analyse the resume and produce a strategic question bank designed to test genuine depth and expose scripted answers.

TECHNICAL (5-7 questions): Personalised to their exact stack. Probe edge cases, trade-offs, failure modes they'd only know from real use.
BEHAVIORAL (3-4 questions): STAR-format tied to specific roles and projects in their resume.
TRAP QUESTIONS (4-5 questions) — MOST CRITICAL:
  a) FAKE TOOL TRAP: Invent a plausible-sounding but non-existent tool in their stack.
  b) CONTRADICTION PROBE: Cross-reference two claims that reveal tension.
  c) SIMPLICITY TEST: Explain complex claimed skill to a non-technical manager in 2 sentences.
  d) SPECIFICITY DRILL: Ask for exact detail only real users know.
  e) ACHIEVEMENT DEPTH: Ask for baseline metric, tool used, and biggest change behind any % claim.
PRESSURE FOLLOW-UPS (3-4 questions): Force spontaneous thinking when answers feel scripted.

Respond ONLY with valid JSON, no markdown, no code fences:
{
  "candidate_name": "name from resume or Candidate",
  "candidate_summary": "2-sentence honest assessment",
  "risk_flags": ["specific claims worth extra scrutiny"],
  "questions": [
    {
      "id": 1,
      "category": "technical",
      "trap_type": null,
      "difficulty": "easy",
      "question": "The exact question to ask",
      "why_it_matters": "What genuine vs coached answers reveal",
      "red_flags": "Phrases that suggest a scripted answer",
      "follow_up": "Probing follow-up"
    }
  ],
  "interviewer_tips": "2-3 sentence strategy note"
}
trap_type values: fake_tool | contradiction | simplicity | specificity | achievement_depth | null

RESUME TO ANALYSE:
`;

exports.handler = async (event) => {

  // ── Diagnostic endpoint: GET — tests actual Gemini connection live
  if (event.httpMethod === "GET") {
    const apiKey = process.env.GEMINI_API_KEY || "";

    // Make a real test call to Gemini
    let geminiTest = {};
    try {
      const testRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: "Say hello in one word." }] }],
            generationConfig: { maxOutputTokens: 10 }
          })
        }
      );
      const testData = await testRes.json();
      geminiTest = {
        http_status: testRes.status,
        ok: testRes.ok,
        raw_response: testData
      };
    } catch (e) {
      geminiTest = { error: e.message };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        version: "GEMINI-4",
        key_set: apiKey.length > 0,
        key_prefix: apiKey.substring(0, 7),
        key_length: apiKey.length,
        gemini_test: geminiTest
      }),
    };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ detail: "Method not allowed" }) };
  }

  try {
    const { resume_text } = JSON.parse(event.body);

    if (!resume_text || resume_text.trim().length < 50) {
      return {
        statusCode: 400,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ detail: "Resume text is too short. Please upload a proper PDF." }),
      };
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ detail: "GEMINI_API_KEY not set in Netlify environment variables." }),
      };
    }

    // Call Google Gemini API
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    const geminiResponse = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: QUESTION_GEN_PROMPT + resume_text }] }],
        generationConfig: { maxOutputTokens: 4096, temperature: 0.7 },
      }),
    });

    const geminiData = await geminiResponse.json();

    if (!geminiResponse.ok) {
      // Return full Gemini error for debugging
      return {
        statusCode: 500,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({
          detail: geminiData?.error?.message || `Gemini API error ${geminiResponse.status}`,
          gemini_status: geminiResponse.status,
          gemini_error: geminiData?.error || {}
        }),
      };
    }

    const rawText = geminiData.candidates[0].content.parts[0].text;

    // Extract JSON from response
    const match = rawText.match(/\{[\s\S]*\}/);
    if (!match) {
      return {
        statusCode: 500,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ detail: "Unexpected response format from Gemini. Please try again." }),
      };
    }

    const result = JSON.parse(match[0]);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify(result),
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ detail: err.message, stack: err.stack }),
    };
  }
};
