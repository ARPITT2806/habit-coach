import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const expectedToken = 'migrate-habitiva-2024-09-10-497b6d8784799eee231b34eadcfbad3a';
  
  if (!expectedToken || request.headers.get('authorization') !== `Bearer ${expectedToken}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    console.log('Running migration deploy...');
    const { execSync } = require('child_process');
    execSync('npx prisma@6.19.3 migrate deploy', { 
      stdio: 'inherit',
      env: { ...process.env }
    });
    
    // Verify tables exist
    const tables = await prisma.$queryRaw`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename IN ('CoachConversation', 'CoachMessage')
    `;
    
    return Response.json({ 
      success: true, 
      message: 'Migration deployed successfully',
      tables: tables.map(t => t.tablename)
    });
  } catch (error) {
    console.error('Migration failed:', error);
    return Response.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}