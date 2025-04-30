import { db } from '../server/db.js';
import { projectAnalyses } from '../shared/schema.js';
import { eq } from 'drizzle-orm';

// ID of the analysis record we added earlier (assuming it's 1)
const analysisIdToUpdate = 1;
// User ID to assign (assuming user with ID 1 exists)
const targetUserId = 1;

async function updateAnalysisUserId() {
  console.log(`Attempting to update userId for analysis ID ${analysisIdToUpdate} to ${targetUserId}...`);
  try {
    const result = await db.update(projectAnalyses)
      .set({ userId: targetUserId })
      .where(eq(projectAnalyses.id, analysisIdToUpdate))
      .returning();

    if (result.length > 0) {
      console.log('Successfully updated analysis:', result);
    } else {
      console.log(`Analysis with ID ${analysisIdToUpdate} not found.`);
    }
  } catch (error) {
    console.error('Error updating analysis:', error);
    process.exit(1); // Exit with error code
  } finally {
    console.log('Script finished.');
    // Optional: Close pool connection if needed
    // import { pool } from '../server/db.js';
    // await pool.end();
  }
}

updateAnalysisUserId();
