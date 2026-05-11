import OpenAI from 'openai';
import { MfrDataProfile } from './DataProfiler';

export class OpenAIService {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || 'MISSING_KEY'
    });
  }

  /**
   * Sends the manufacturer data profile to OpenAI to suggest a configuration.
   */
  async suggestConfiguration(profile: MfrDataProfile): Promise<any> {
    if (!process.env.OPENAI_API_KEY) {
      console.warn('⚠️ OPENAI_API_KEY not set. Returning mock suggestions.');
      // Return a basic mock structure if key is missing during dev
      return this.getMockSuggestion(profile);
    }

    const prompt = `
You are an expert e-commerce catalog architect analyzing data for a commercial kitchen equipment manufacturer named "${profile.mfrName}".
You need to analyze the provided data schema and suggest how to structure this data in Shopify.

Data Schema Summary:
- Total Products: ${profile.totalProducts}
- Unique Product Types: ${JSON.stringify(profile.uniqueProductTypes)}
- Available Properties (from specs): ${JSON.stringify(profile.categoryValueKeys)}

Task 1: Suggest the best 3 properties to use as Shopify Variant Options (e.g. Size, Color, Doors). 
Pick the most important differentiating factors from the "Available Properties" list. 
If less than 3 make sense, suggest fewer.

Task 2: Suggest a category mapping. For each Unique Product Type, suggest a Shopify Collection name, and a set of tags to apply.

Respond ONLY with a valid JSON object in the following format, with no markdown formatting or extra text:
{
  "suggestedOptions": ["Property1", "Property2", "Property3"],
  "categoryMappings": [
    {
      "aqProductType": "Raw Type from list",
      "shopifyCollection": "Suggested Collection Name",
      "tagsToApply": ["tag1", "tag2"]
    }
  ]
}
`;

    try {
      console.log(`🧠 Sending profile to OpenAI for analysis...`);
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "You are a helpful assistant that only outputs valid JSON." },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error("No content received from OpenAI");

      return JSON.parse(content);
    } catch (error) {
      console.error("❌ OpenAI analysis failed:", error);
      throw error;
    }
  }

  private getMockSuggestion(profile: MfrDataProfile) {
    // Basic fallback if no API key
    const opts = profile.categoryValueKeys.slice(0, 3);
    const mappings = profile.uniqueProductTypes.map(pt => ({
      aqProductType: pt,
      shopifyCollection: pt,
      tagsToApply: [`category:${pt}`]
    }));
    return { suggestedOptions: opts, categoryMappings: mappings };
  }
}
