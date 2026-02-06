// Gemini API utility for mistake analysis

class GeminiAPI {
    constructor() {
        this.baseURL =
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent";
        this.apiKey = null;
    }

    async initialize() {
        return new Promise((resolve) => {
            chrome.storage.sync.get(["gemini_api_key"], (data) => {
                this.apiKey = data.gemini_api_key || null;
                resolve(!!this.apiKey);
            });
        });
    }

    async analyzeMistakes(attempts, problemInfo) {
        if (!this.apiKey) {
            const initialized = await this.initialize();
            if (!initialized) {
                return {
                    success: false,
                    error: "Gemini API key not configured",
                };
            }
        }

        if (!attempts || attempts.length === 0) {
            return { success: false, error: "No attempts to analyze" };
        }

        try {
            const prompt = this.buildAnalysisPrompt(attempts, problemInfo);

            const response = await fetch(`${this.baseURL}?key=${this.apiKey}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    contents: [
                        {
                            parts: [
                                {
                                    text: prompt,
                                },
                            ],
                        },
                    ],
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                // Use debug-aware error logging
                if (typeof debugError === 'function') {
                    debugError(`[Gemini API] Error ${response.status}:`, errorText);
                } else if (typeof window !== 'undefined' && typeof window.isDebugMode === 'function' && window.isDebugMode()) {
                    console.error(`[Gemini API] Error ${response.status}:`, errorText);
                }
                throw new Error(
                    `Gemini API responded with ${response.status}: ${errorText}`,
                );
            }

            const data = await response.json();

            if (
                data.candidates &&
                data.candidates[0] &&
                data.candidates[0].content
            ) {
                const rawAnalysis = data.candidates[0].content.parts[0].text;
                const parsed = this.parseAnalysisResponse(rawAnalysis);
                return { success: true, analysis: parsed.summary, tags: parsed.tags };
            } else {
                throw new Error("Invalid response format from Gemini API");
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // Parse the Gemini response to extract tags and summary
    parseAnalysisResponse(rawAnalysis) {
        // Extract "TAGS: tag1, tag2, tag3" line from response
        const tagsMatch = rawAnalysis.match(/^TAGS:\s*(.+)$/m);
        const tags = tagsMatch
            ? tagsMatch[1].split(',').map(t => t.trim()).filter(t => t.length > 0)
            : [];

        // Remove the TAGS line from summary for cleaner storage
        const summary = rawAnalysis.replace(/^TAGS:\s*.+$/m, '').trim();

        return { tags, summary };
    }

    buildAnalysisPrompt(attempts, problemInfo) {
        const { title, description } = problemInfo;

        let prompt = `Analyze the coding attempts for this problem and provide a brief mistake analysis in markdown format.

Problem: ${title}
${description ? `Description: ${description.substring(0, 500)}...` : ""}

Coding Attempts (chronological order):
`;

        attempts.forEach((attempt, index) => {
            prompt += `
### Attempt ${index + 1}
\`\`\`${attempt.language}
${attempt.code}
\`\`\`
`;
        });

        prompt += `

CRITICAL: You MUST start your response with exactly this format:
TAGS: tag1, tag2, tag3

Use ONLY these specific tag categories (pick 1-3 most relevant):
- Logic Error
- Syntax Error  
- Algorithm Choice
- Edge Cases
- Data Structure
- Time Complexity
- Space Complexity
- Input Handling
- Loop Logic
- Conditional Logic
- Array Bounds
- Null Pointer
- Off By One

Then provide brief analysis:
1. **Time-Travel Debugging**: From all of them attempts choose the most clicking moments/code snippets, which even when user sees even after a long time, they should remember how he solved this problem.
2. **Key Issues**: What specific errors occurred. 
3. **Improvements**: As attemps progressed, what improved.
Keep under 100 words total. Focus only on technical programming concepts.`;

        return prompt;
    }
}

// Make GeminiAPI available globally
window.GeminiAPI = GeminiAPI;
