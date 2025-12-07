import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SYSTEM_PROMPT = `Tu es un assistant spécialisé dans la recherche de formations professionnelles en France.

Tu dois extraire et structurer les informations sur les formations qui permettent d'accéder à un métier donné.

INSTRUCTIONS :
1. Recherche des formations diplômantes (CAP, Bac Pro, BTS, BUT, Licence Pro, etc.)
2. Privilégie les organismes de formation reconnus : CFAA, CFPPA, MFR, CFA, Lycées agricoles, IUT, Universités, GRETA, AFPA
3. Extrais les informations suivantes pour chaque formation :
   - intitule : nom exact de la formation
   - organisme : nom de l'établissement
   - rncp : code RNCP si disponible (ex: "RNCP35634")
   - niveau : "4" (Bac), "5" (Bac+2), "6" (Bac+3/4), ou null
   - ville : ville de l'organisme
   - region : région française
   - site_web : URL du site si disponible
   - type : "Initial", "Alternance", "Continue", ou "Initial/Alternance"
   - modalite : "Présentiel", "Distance", ou "Mixte"

4. Si le niveau demandé n'est pas "all", filtre uniquement les formations du niveau demandé

RÉPONDS UNIQUEMENT avec un objet JSON de cette structure :
{
  "metier_normalise": "nom du métier recherché",
  "ville_reference": "ville de référence",
  "niveau_filtre": "4" | "5" | "6" | "all",
  "formations": [
    {
      "intitule": "...",
      "organisme": "...",
      "rncp": "...",
      "niveau": "4" | "5" | "6" | null,
      "ville": "...",
      "region": "...",
      "site_web": "...",
      "type": "...",
      "modalite": "..."
    }
  ]
}`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { metier, ville, niveau } = await req.json();

    if (!metier || !ville || !niveau) {
      throw new Error("Paramètres manquants");
    }

    const perplexityApiKey = Deno.env.get("PERPLEXITY_API_KEY");
    if (!perplexityApiKey) {
      throw new Error("Clé API Perplexity manquante");
    }

    console.log(`🔎 Recherche Perplexity: ${metier} à ${ville}, niveau ${niveau}`);

    const userPrompt = `Trouve les formations en France pour le métier "${metier}" autour de "${ville}".
${niveau !== 'all' ? `Uniquement les formations de niveau ${niveau}.` : 'Tous niveaux (4, 5, 6).'}

Cherche particulièrement dans les CFAA, CFPPA, MFR, CFA, Lycées agricoles, IUT, Universités, GRETA, AFPA.

Donne-moi les formations avec leurs détails complets (intitulé exact, organisme, ville, région, niveau, type, modalité, site web, code RNCP si disponible).`;

    const perplexityResponse = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${perplexityApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar-pro',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 4000,
        temperature: 0.2,
        return_citations: false,
        return_images: false
      }),
    });

    if (!perplexityResponse.ok) {
      const errorText = await perplexityResponse.text();
      console.error('Perplexity API error:', errorText);
      throw new Error(`Erreur Perplexity API: ${perplexityResponse.status}`);
    }

    const perplexityData = await perplexityResponse.json();
    const content = perplexityData.choices[0].message.content;

    let result;
    try {
      result = JSON.parse(content);
    } catch (e) {
      console.warn("JSON direct échoué, tentative regex");
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("Impossible de parser le JSON Perplexity");
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
