/**
 * IntegrityAI — Smart Question Engine
 * Netlify Serverless Function
 *
 * This function runs on Netlify's servers (free).
 * It holds your Anthropic API key safely as an environment variable.
 * The browser never sees your key — it only talks to this function.
 */

const QUESTION_GEN_PROMPT = `You are IntegrityAI's Smart Question Engine — an expert technical interviewer and HR consultant who specialises in detecting AI-assisted and coached interview cheating.

Your task: analyse the provided resume and produce a strategic interview question bank designed to:
1. Test GENUINE technical depth, not surface recall.
2. EXPOSE scripted or AI-generated answers by forcing real-world specificity.
3. VERIFY hands-on experience through contradiction traps and detail probes.

QUESTION CATEGORIES:

TECHNICAL (5-7 questions)
- Personalised to the candidate's exact tech stack, frameworks, and project claims.
- Probe edge cases, trade-offs, failure modes they'd only know from real use.
- Include at least one "why did you choose X over Y?" question.

BEHAVIORAL (3-4 questions)
- STAR-format, tied to specific roles and projects in their resume.
- Reference actual timeframes or company names from their history.

TRAP QUESTIONS (4-5 questions) - MOST CRITICAL
a) FAKE TOOL TRAP: Invent a plausible-sounding but non-existent tool in their stack.
   If they use React, mention "ReactFusion StateSync".
   If they use AWS, mention "AWS DataBridge Connector".
   If they use Python, mention "PyFlowX orchestration library".
   A real expert says "I've never heard of that." A coached candidate may play along.
b) CONTRADICTION PROBE: Cross-reference two claims in their resume that reveal tension.
c) SIMPLICITY TEST: "Explain [complex claimed skill] to a non-technical manager in 2 sentences."
d) SPECIFICITY DRILL: Ask for exact detail only real users know — error messages, config file names, default port numbers.
e) ACHIEVEMENT DEPTH: If they claim "improved performance by 40%", ask for the baseline metric, measurement tool, and the single biggest change.

PRESSURE FOLLOW-UPS (3-4 questions)
For when the interviewer senses a scripted answer — force spontaneous thinking.
Example: "Forget the textbook answer. Tell me the last time this broke in production."

For each question also provide:
- why_it_matters: what genuine vs coached answers reveal
- red_flags: exact phrases that signal a scripted answer
- follow_up: one probing follow-up to dig deeper

OUTPUT: Respond ONLY with valid JSON. No markdown. No explanation outside JSON.

{
  "candidate_name": "name from resume or Candidate",
  "candidate_summary": "2-sentence honest assessment of claimed profile",
  "risk_flags": ["specific resume claims worth extra scrutiny"],
  "questions": [
    {
      "id": 1,
      "category": "technical",
      "trap_type": null,
      "difficulty": "easy",
      "question": "The exact question to ask",
      "why_it_matters": "What genuine vs coached answers reveal",
      "red_flags": "Phrases that suggest a scripted answer",
      "follow_up": "Probing follow-up if they answer well"
    }
  ],
  "interviewer_tips": "2-3 sentence strategy note"
}

trap_type values: fake_tool | contradiction | simplicity | specificity | achievement_depth | null

RESUME TO ANALYSE:
`;

exports.handler = async (event) => {
  // Only accept POST requests
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ detail: "Method not allowed" }),
    };
  }

  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: "",
    };
  }

  try {
    // Parse the request body
    const { resume_text } = JSON.parse(event.body);

    if (!resume_text || resume_text.trim().length < 50) {
      return {
        statusCode: 400,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ detail: "Resume text is too short. Please upload a proper PDF." }),
      };
    }

    // Get API key from Netlify environment variable (never visible to browser)
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ detail: "API key not configured on server." }),
      };
    }

    // Call Claude API using native fetch (no npm packages needed)
    const claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: QUESTION_GEN_PROMPT + resume_text,
          },
        ],
      }),
    });

    if (!claudeResponse.ok) {
      const errData = await claudeResponse.json().catch(() => ({}));
      return {
        statusCode: 500,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({
          detail: errData?.error?.message || `Claude API error ${claudeResponse.status}`,
        }),
      };
    }

    const claudeData = await claudeResponse.json();
    const rawText = claudeData.content[0].text;

    // Extract JSON from Claude's response
    const match = rawText.match(/\{[\s\S]*\}/);
    if (!match) {
      return {
        statusCode: 500,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ detail: "Unexpected response format from Claude. Try again." }),
      };
    }

    const result = JSON.parse(match[0]);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify(result),
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ detail: err.message }),
    };
  }
};
