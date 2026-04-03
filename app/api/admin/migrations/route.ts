import fs from 'fs';
import path from 'path';
import { getSupabaseAdminClient } from '@/app/lib/supabase-server';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  // Verify this is a local request (basic security)
  const host = request.headers.get('host') || '';
  if (!host?.includes('localhost') && !host?.includes('127.0.0.1')) {
    return NextResponse.json(
      { error: 'Migrations can only be applied locally' },
      { status: 403 }
    );
  }

  try {
    const supabase = getSupabaseAdminClient();
    
    // Read all migration files
    const migrationsDir = path.join(process.cwd(), 'supabase/migrations');
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    const results = [];

    for (const file of migrationFiles) {
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf-8');

      try {
        // Execute the SQL
        const { error } = await supabase.rpc('exec', { sql });
        
        if (error) {
          // If exec RPC doesn't exist, try direct query
          if (error.message?.includes('function exec')) {
            // Parse and execute each statement
            const statements = sql.split(';').filter(s => s.trim());
            for (const statement of statements) {
              if (statement.trim()) {
                // For non-SELECT statements, we need to use a workaround
                // This is a limitation of Supabase - raw SQL execution requires the dashboard
                results.push({
                  file,
                  status: 'skipped',
                  reason: 'Raw SQL execution requires Supabase dashboard or CLI'
                });
              }
            }
          } else {
            results.push({
              file,
              status: 'error',
              error: error.message
            });
          }
        } else {
          results.push({
            file,
            status: 'success'
          });
        }
      } catch (err: any) {
        results.push({
          file,
          status: 'error',
          error: err.message
        });
      }
    }

    return NextResponse.json({
      message: 'Migration process completed. See results below. Note: Raw SQL execution may require the Supabase dashboard.',
      dashboardUrl: `https://supabase.com/dashboard/project/${process.env.NEXT_PUBLIC_SUPABASE_URL?.split('.supabase.co')[0]?.split('//')[1]}/sql`,
      results
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}
