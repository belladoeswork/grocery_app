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
      // Extract the user ID from the webhook
      const userId = evt.data.id;
      
      if (!userId) {
        console.error('No user ID in webhook data');
        return new Response('No user ID in webhook data', { status: 400 });
      }
      
      console.log(`User created with ID: ${userId}`);
      
      try {
        // Instead of fetching from Clerk API, use the webhook data directly
        console.log('Using webhook data directly');
        
        // Extract the user details from webhook payload more carefully
        const email = evt.data.email_addresses?.[0]?.email_address || null;
        const firstName = evt.data.first_name || null;
        const lastName = evt.data.last_name || null;
        
        // Log the raw data we're working with
        console.log('Raw user data from Clerk:', {
          id: userId,
          email,
          firstName,
          lastName,
          emailAddresses: evt.data.email_addresses
        });
        
        // Generate a more reliable username
        let username = null;
        if (firstName && lastName) {
          username = `${firstName.toLowerCase()}_${lastName.toLowerCase()}`;
        } else if (firstName) {
          username = firstName.toLowerCase();
        } else if (email) {
          username = email.split('@')[0];
        } else {
          username = `user_${userId.substring(0, 8)}`;
        }
        
        // Make username unique by adding part of the user ID
        username = `${username}_${userId.substring(0, 6)}`;
        
        // Prepare user data for Supabase with careful null handling
        const userData = {
          id: userId,
          email: email,
          username: username,
          phone_number: null,
          // Use server timestamp for consistency
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          address: null,
          role: 'user'
        };
        
        // Add more detailed logging
        console.log('Prepared user data for Supabase:', JSON.stringify(userData, null, 2));
        
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
        
        // Minimal test data
        const testUserData = {
          id: userId,
          email: email || `${userId}@example.com`, // Ensure email is never null
          username: `user_${userId.substring(0, 8)}` // Simple, guaranteed unique username
        };

        console.log('Testing with minimal data:', testUserData);

        const { data, error } = await supabase
          .from('Users')
          .upsert([testUserData], { 
            onConflict: 'id' 
          })
          .select();

        if (error) {
          // Log the full error details
          console.error('Error with Supabase operation:', JSON.stringify(error, null, 2));
          
          // Check for specific error types
          if (error.code === '23505') {
            console.error('Unique constraint violation - likely duplicate username or email');
          } else if (error.code === '23502') {
            console.error('Not-null constraint violation - missing required field');
          }
          
          return new Response(`Database error: ${JSON.stringify(error)}`, { 
            status: 500 
          });
        }
        
        console.log('Successfully synced user to Supabase:', data);
        return new Response('User successfully synced to Supabase', { status: 200 });
        
      } catch (err) {
        console.error('Error processing user:', err);
        return new Response(`Error processing user: ${err instanceof Error ? err.message : JSON.stringify(err)}`, {
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