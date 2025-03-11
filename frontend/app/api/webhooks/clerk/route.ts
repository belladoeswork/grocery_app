import { Webhook } from 'svix'
import { headers } from 'next/headers'
import { WebhookEvent } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: Request) {
  // Get the headers
  const headerPayload = await headers();
  const svix_id = headerPayload.get("svix-id");
  const svix_timestamp = headerPayload.get("svix-timestamp");
  const svix_signature = headerPayload.get("svix-signature");

  // If there are no headers, error out
  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response('Error: Missing svix headers', {
      status: 400
    });
  }

  // Get the body
  const payload = await req.json();
  const body = JSON.stringify(payload);

  // Create a new Svix instance with your webhook secret
  const wh = new Webhook(process.env.CLERK_WEBHOOK_SECRET || '');

  let evt: WebhookEvent;

  // Verify the payload with the headers
  try {
    evt = wh.verify(body, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    }) as WebhookEvent;
  } catch (err) {
    console.error('Error verifying webhook:', err);
    return new Response('Error verifying webhook', {
      status: 400
    });
  }

  // Handle the webhook
  const eventType = evt.type;
  
  console.log(`Received webhook event: ${eventType}`);

  if (eventType === 'user.created') {
    const { id, email_addresses, first_name, last_name } = evt.data;
    const email = email_addresses && email_addresses[0]?.email_address;

    console.log(`Processing new user: ${id}, email: ${email}`);

    // Create a Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY! // Use service role key for admin operations
    );

    // Insert the user into your Supabase users table
    const { error, data } = await supabase
      .from('users')
      .insert({
        id: id, // Use Clerk's user ID
        email: email,
        first_name: first_name,
        last_name: last_name,
        created_at: new Date().toISOString()
      })
      .select();

    if (error) {
      console.error('Error inserting user into Supabase:', error);
      return new Response('Error inserting user', {
        status: 500
      });
    }
    
    console.log('Successfully inserted user into Supabase:', data);
  }

  return new Response('Webhook received', {
    status: 200
  });
} 