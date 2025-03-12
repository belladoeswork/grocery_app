import { Webhook } from 'svix'
import { headers } from 'next/headers'
import { WebhookEvent } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: Request) {
  try {
    // Get the headers
    const headerPayload = await headers();
    const svix_id = headerPayload.get("svix-id");
    const svix_timestamp = headerPayload.get("svix-timestamp");
    const svix_signature = headerPayload.get("svix-signature");

    console.log("Webhook called with headers:", { 
      svix_id, 
      svix_timestamp, 
      "svix_signature": svix_signature?.substring(0, 10) + "..." 
    });

    // If there are no headers, error out
    if (!svix_id || !svix_timestamp || !svix_signature) {
      console.error("Missing svix headers");
      return new Response('Error: Missing svix headers', {
        status: 400
      });
    }

    // Get the body
    const payload = await req.json();
    const body = JSON.stringify(payload);

    // Verify webhook secret exists
    if (!process.env.CLERK_WEBHOOK_SECRET) {
      console.error("CLERK_WEBHOOK_SECRET is not set");
      return new Response('Server configuration error', { status: 500 });
    }

    // Create a new Svix instance with your webhook secret
    const wh = new Webhook(process.env.CLERK_WEBHOOK_SECRET);

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
      return new Response(`Error verifying webhook: ${err instanceof Error ? err.message : 'Unknown error'}`, {
        status: 400
      });
    }

    // Handle the webhook
    const eventType = evt.type;
    console.log(`Processing webhook event: ${eventType}`);

    if (eventType === 'user.created') {
      // Log the full data structure to understand its format
      console.log("Full user data:", JSON.stringify(evt.data));
      
      // The data structure from Clerk is different than what we're expecting
      // Let's extract the fields correctly
      const id = evt.data.id;
      const email = evt.data.email_addresses?.[0]?.email_address;
      const first_name = evt.data.first_name || null;
      const last_name = evt.data.last_name || null;
      
      console.log(`Processing user with extracted data:`, {
        id,
        email,
        first_name,
        last_name
      });
      
      // Verify Supabase environment variables
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        console.error("Missing Supabase configuration");
        return new Response('Missing Supabase configuration', { status: 500 });
      }

      // Create a Supabase client
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );

      console.log("Creating Supabase client with URL:", process.env.NEXT_PUBLIC_SUPABASE_URL);
      console.log("Service role key starts with:", process.env.SUPABASE_SERVICE_ROLE_KEY?.substring(0, 5) + "...");

      // Before trying to insert, check if the table exists
      const { data: tables, error: tableError } = await supabase
        .from('information_schema.tables')
        .select('table_name')
        .eq('table_schema', 'public');

      console.log('Available tables:', tables);

      if (tableError) {
        console.error('Error checking tables:', tableError);
        return new Response(`Error checking tables: ${JSON.stringify(tableError)}`, {
          status: 500
        });
      }

      // Check if Users table exists
      const usersTableExists = tables.some(t => t.table_name === 'Users');
      if (!usersTableExists) {
        console.error('Users table does not exist!');
        return new Response('Users table does not exist', { status: 500 });
      }

      try {
        // Try a direct SQL query
        const { data, error } = await supabase.rpc('insert_user', {
          user_id: id,
          user_email: email,
          user_name: first_name || email?.split('@')[0] || 'user'
        });

        if (error) {
          console.error('SQL insert error:', error);
          return new Response(`SQL error: ${JSON.stringify(error)}`, {
            status: 500
          });
        }

        console.log('SQL insert result:', data);
      } catch (err) {
        console.error('Error with SQL operation:', err);
        return new Response(`SQL operation failed: ${err instanceof Error ? err.message : JSON.stringify(err)}`, {
          status: 500
        });
      }
    }

    return new Response('Webhook processed successfully', {
      status: 200
    });
  } catch (error) {
    console.error("Unexpected webhook error:", error);
    return new Response(`Server error: ${error instanceof Error ? error.message : 'Unknown error'}`, {
      status: 500
    });
  }
} 