export const config = {
  runtime: 'edge',
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Method Not Allowed' }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }

  try {
    const body = await req.json()
    const messages = body?.messages || [{ role: 'user', content: body?.message }]

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages,
      }),
    })

    const stream = res.body
    return new Response(stream)
  } catch (error: any) {
    console.error('[Chat API Error]', error)
    return new Response(
      JSON.stringify({ ok: false, error: 'Något gick fel. Försök igen eller kontakta oss på kontakt@proofy.se.' }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      },
    )
  }
}

export default handler
