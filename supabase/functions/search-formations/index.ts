import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import OpenAI from "npm:openai@4.72.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ... Ton SYSTEM_PROMPT reste identique, il est très bien ...
const SYSTEM_PROMPT = `Tu es un assistant expert... (laisse ton prompt ici)`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { metier, ville, niveau } = await req.json();

    if (!metier || !ville || !niveau) throw new Error("Paramètres manquants");

    const tavilyApiKey = Deno.env.get("TAVILY_API_KEY");
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!tavilyApiKey || !openaiApiKey) throw new Error("Clés API manquantes");

    console.log(`🔎 Recherche: ${metier} à ${ville}`);

    // OPTIMISATION 1 : Requête un peu plus large pour capter les synonymes techniques
    const query = `formation "${metier}" OR cursus scolaire proche ${ville} France recrutement alternance`;

    // Appel Tavily
    const tavilyResponse = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: tavilyApiKey,
        query: query,
        max_results: 15, // Réduit à 15 pour gagner du temps de traitement (token & vitesse)
        search_depth: "advanced",
        include_domains: ["onisep.fr", "lertudiant.fr", "pole-emploi.fr", "france-travail.fr", ".fr"], // Optionnel : Cible des sites fiables si tu veux
      }),
    });

    if (!tavilyResponse.ok) throw new Error(`Erreur Tavily: ${tavilyResponse.status}`);
    const tavilyData = await tavilyResponse.json();
    const allResults = tavilyData.results || [];

    if (allResults.length === 0) {
      return new Response(JSON.stringify({ metier_normalise: metier, ville_reference: ville, niveau_filtre: niveau, formations: [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Préparation pour OpenAI
    const rawData = allResults
      .map((r: any) => `Source: ${r.title} (${r.url})\nTxt: ${r.content.substring(0, 800)}`) // Limite le contenu par résultat pour économiser des tokens
      .join("\n\n");

    const openai = new OpenAI({ apiKey: openaiApiKey });

    const userPrompt = `Analyse ces résultats Tavily pour le métier "${metier}" à "${ville}".
    Niveau: ${niveau}.
    
    DONNÉES:
    ${rawData}
    
    Renvoie le JSON strict demandé dans le System Prompt.`;

    console.log('🤖 Appel OpenAI o3-mini...');

    const completion = await openai.chat.completions.create({
      model: 'o3-mini', 
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt }
      ],
      // @ts-ignore: reasoning_effort est nouveau, parfois TS rale
      reasoning_effort: "low", // IMPORTANT: On demande à o3 de ne pas trop réfléchir pour aller vite (évite le timeout)
      max_completion_tokens: 4000, 
      response_format: { type: 'json_object' } // Force le JSON pur
    });

    const content = completion.choices[0].message.content;

    // SECURITE JSON : On essaie de parser directement, sinon on nettoie
    let result;
    try {
        result = JSON.parse(content || "{}");
    } catch (e) {
        console.warn("JSON direct échoué, tentative regex");
        const jsonMatch = content?.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            result = JSON.parse(jsonMatch[0]);
        } else {
            throw new Error("Impossible de parser le JSON OpenAI");
        }
    }

    console.log(`✅ Formations trouvées: ${result.formations?.length || 0}`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error('❌ Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});