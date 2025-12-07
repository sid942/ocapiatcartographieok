import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { metier, ville } = await req.json();

    if (!metier || !ville) {
      return new Response(
        JSON.stringify({ error: "Param\u00e8tres manquants: metier, ville" }),
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

    const query = `Formations en France permettant d'acc\u00e9der au m\u00e9tier : ${metier}, autour de ${ville}, niveaux CAP \u00e0 Bac+3, RNCP, CFAA, CFPPA, MFR, IUT, AFPA, GRETA.`;

    console.log('Recherche Tavily:', { metier, ville, query });

    const tavilyResponse = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: tavilyApiKey,
        query: query,
        search_depth: 'advanced',
        max_results: 25,
      }),
    });

    if (!tavilyResponse.ok) {
      const errorText = await tavilyResponse.text();
      console.error('Tavily API error:', errorText);
      throw new Error(`Erreur Tavily API: ${tavilyResponse.status}`);
    }

    const tavilyResults = await tavilyResponse.json();

    console.log(`R\u00e9sultats Tavily: ${tavilyResults.results?.length || 0} r\u00e9sultats trouv\u00e9s`);

    return new Response(
      JSON.stringify(tavilyResults),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error('Error calling Tavily API:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Erreur inconnue lors de l\'appel \u00e0 Tavily'
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