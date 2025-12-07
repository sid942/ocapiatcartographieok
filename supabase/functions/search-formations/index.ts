import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import OpenAI from "npm:openai@4.72.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SYSTEM_PROMPT = `Tu es un assistant expert des formations professionnelles en France.

Tu travailles exclusivement sur les 12 m\u00e9tiers suivants : Technico-commercial ; Agent de silo ; Chauffeur agricole ; Responsable silo ; Responsable logistique ; Magasinier / Cariste ; Responsable services techniques ; Contr\u00f4leur qualit\u00e9 ; Agr\u00e9eur ; Conducteur de ligne ; Technicien culture ; Commercial export.

R\u00c8GLE PRINCIPALE : ANALYSE DES R\u00c9SULTATS TAVILY

Tu vas recevoir des r\u00e9sultats de recherche web (Tavily) ci-dessous.
Tu dois analyser UNIQUEMENT ces r\u00e9sultats.
Ne garde que les formations R\u00c9ELLES, V\u00c9RIFIABLES, dont l'existence est confirm\u00e9e dans les r\u00e9sultats.
Ne garde que les formations permettant r\u00e9ellement d'acc\u00e9der au m\u00e9tier demand\u00e9, m\u00eame indirectement.
Ne garde rien si la formation n'est pas clairement li\u00e9e \u00e0 un d\u00e9bouch\u00e9 du m\u00e9tier.

R\u00c8GLE INTELLIGENCE M\u00c9TIER

Tu dois s\u00e9lectionner TOUTES les formations dont les d\u00e9bouch\u00e9s reconnus permettent d'acc\u00e9der au m\u00e9tier demand\u00e9, m\u00eame si ce n'est pas dans leur titre exact.

Tu raisonnes comme un conseiller en orientation :
\u2013 une formation est retenue si ses comp\u00e9tences, blocs RNCP, ou d\u00e9bouch\u00e9s habituels correspondent au m\u00e9tier.
\u2013 tu acceptes les formations g\u00e9n\u00e9ralistes SI leurs d\u00e9bouch\u00e9s couvrent r\u00e9ellement le m\u00e9tier.

Exemples de logique :
\u2013 Pour Chauffeur agricole : CAP Maintenance mat\u00e9riels agricoles, CAP Conducteur routier, CACES, Agro\u00e9quipement, Bac pro CGEA.
\u2013 Pour Technico-commercial : BTS TC, BTS NDRC, BTS MCO, BUT TC, Licence pro commerce, Bachelor Business Developer RNCP.
\u2013 Pour Agent de silo : Bac Pro Agro\u00e9quipement, Bac Pro CGEA, CQP Agent de silo, BTS APV, formations s\u00e9curit\u00e9 silo/ATEX.
\u2013 Pour Contr\u00f4leur qualit\u00e9 : BTS QIABI, BTS bioqualit\u00e9, BUT g\u00e9nie bio, LP contr\u00f4le qualit\u00e9.
\u2013 Pour Responsable logistique : Bac Pro Logistique, BTS GTLA, titre pro technicien logistique, LP logistique.
\u2013 Pour Conducteur de ligne : CAP IAA, Bac pro pilotage de ligne, titre pro conducteur de ligne, BTS maintenance.
\u2013 Pour Commercial export : BTS CI, LP commerce international, BUT TC, bachelors commerce + export.
\u2013 Pour Responsable silo / Agent de silo : Bac Pro CGEA, Bac Pro Agro\u00e9quipement, BTS APV, BTS ACSE, CQP technicien silo, formations stockage c\u00e9r\u00e9ales.

R\u00c8GLE G\u00c9OGRAPHIQUE

Maximum 50 km autour de la ville demand\u00e9e.
Tu classes les r\u00e9sultats de la plus proche \u00e0 la plus \u00e9loign\u00e9e.

R\u00c8GLE ANTI-DOUBLONS

Une formation ne doit appara\u00eetre qu'une seule fois par organisme.

R\u00c8GLE NIVEAUX

Niveau : 4, 5 ou 6. Si inconnu : null.
Modalit\u00e9 : initiale, apprentissage, alternance, continue, etc.

FORMAT FINAL STRICT

Retourne UNIQUEMENT du JSON valide au format suivant :

{
"metier_normalise": "string",
"ville_reference": "string",
"niveau_filtre": "4|5|6|all",
"formations": [
{
"intitule": "string",
"organisme": "string",
"rncp": "string|null",
"niveau": "4|5|6|null",
"ville": "string",
"region": "string",
"site_web": "string|null",
"type": "string",
"modalite": "string|null",
"distance_km": number
}
]
}

Aucun texte avant. Aucun texte apr\u00e8s. Uniquement le JSON.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { metier, ville, niveau } = await req.json();

    if (!metier || !ville || !niveau) {
      return new Response(
        JSON.stringify({ error: "Param\u00e8tres manquants: metier, ville, niveau" }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const tavilyApiKey = Deno.env.get("TAVILY_API_KEY");
    if (!tavilyApiKey) {
      return new Response(
        JSON.stringify({ error: "Cl\u00e9 API Tavily non configur\u00e9e" }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiApiKey) {
      return new Response(
        JSON.stringify({ error: "Cl\u00e9 API OpenAI non configur\u00e9e" }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    console.log('Recherche Tavily:', { metier, ville });

    const query = `formations professionnelles ${metier} autour de ${ville} France BTS Bac Pro Licence CFA lycee ecole`;

    console.log(`Query Tavily: ${query}`);

    const tavilyResponse = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: tavilyApiKey,
        query: query,
        max_results: 20,
        search_depth: "advanced",
      }),
    });

    let allResults: any[] = [];

    if (tavilyResponse.ok) {
      const tavilyData = await tavilyResponse.json();
      console.log(`Resultats Tavily: ${tavilyData.results?.length || 0}`);
      if (tavilyData.results && tavilyData.results.length > 0) {
        allResults = tavilyData.results;
      }
    } else {
      console.error(`Erreur Tavily: ${tavilyResponse.status}`);
      const errorText = await tavilyResponse.text();
      console.error(`Erreur details: ${errorText}`);
    }

    console.log(`Total resultats Tavily: ${allResults.length}`);

    if (allResults.length === 0) {
      console.log('Aucun resultat Tavily, retour formation vide');
      return new Response(
        JSON.stringify({
          metier_normalise: metier,
          ville_reference: ville,
          niveau_filtre: niveau,
          formations: []
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const rawData = allResults
      .map((r: any) => `TITRE: ${r.title || 'N/A'}\nURL: ${r.url || 'N/A'}\nCONTENU: ${r.content || 'N/A'}`)
      .join("\n\n---RESULT---\n\n");

    console.log(`Longueur totale des donnees: ${rawData.length} caracteres`);

    const openai = new OpenAI({
      apiKey: openaiApiKey,
    });

    const userPrompt = `Voici les donn\u00e9es trouv\u00e9es sur Internet via Tavily pour le m\u00e9tier ${metier} autour de ${ville}.

Niveau souhait\u00e9: ${niveau === 'all' ? 'tous les niveaux (4, 5 et 6)' : 'niveau ' + niveau}.

DONN\u00c9ES TAVILY :
${rawData}

INSTRUCTIONS :
- Analyse uniquement les donn\u00e9es ci-dessus
- Ne garde que les formations R\u00c9ELLES, V\u00c9RIFIABLES, dont l'existence est confirm\u00e9e
- Ne garde que les formations permettant r\u00e9ellement d'acc\u00e9der au m\u00e9tier demand\u00e9, m\u00eame indirectement
- Ne garde rien si la formation n'est pas clairement li\u00e9e \u00e0 un d\u00e9bouch\u00e9 du m\u00e9tier
- Calcule les distances approximatives depuis ${ville}
- Maximum 50 km de rayon
- Si tu ne trouves AUCUNE formation pertinente dans les donn\u00e9es, retourne un tableau formations vide []

G\u00e9n\u00e8re maintenant le JSON OCAPIAT demand\u00e9 au format sp\u00e9cifi\u00e9.`;

    console.log('Appel a OpenAI');

    const completion = await openai.chat.completions.create({
      model: 'o3-mini',
      messages: [
        {
          role: 'system',
          content: SYSTEM_PROMPT
        },
        {
          role: 'user',
          content: userPrompt
        }
      ],
      max_completion_tokens: 4000,
      response_format: { type: 'json_object' }
    });

    const content = completion.choices[0].message.content;

    if (!content) {
      throw new Error('Aucune reponse recue de l\'API OpenAI');
    }

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('No JSON in response. Full content:', content);
      throw new Error('La reponse ne contient pas de donnees JSON valides.');
    }

    const result = JSON.parse(jsonMatch[0]);

    console.log(`Formations trouvees: ${result.formations?.length || 0}`);

    return new Response(
      JSON.stringify(result),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Erreur inconnue'
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});