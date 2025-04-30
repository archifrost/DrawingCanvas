import { db } from '../server/db.js'; // Adjust path if necessary
import { projectAnalyses } from '../shared/schema.js'; // Adjust path if necessary

// Sample data from user
const sampleData = {
  city: 'İSTANBUL',
  district: 'SULTANBEYLİ',
  neighborhood: 'GAZİ',
  block: '6107',
  parcel: '1',
  land_area: '355.53', // Drizzle expects numeric as string or number
  owner: 'Fuat ASLAN',
  sheet_no: 'G22B01A2B',
  building_order: 'İkiz',
  plan_position: 'Konut Alanı',
  floor_count: '8', // Assuming text type based on schema
  ground_coverage_ratio: '0.5', // TAKS
  floor_area_ratio: '1.05', // Emsal
  roof_type: 'yapılamaz',
  // roof_angle: null, // Belirtilmemiş
  front_setback: '5',
  // side_setback: null, // Belirtilmemiş
  // rear_setback: null, // Belirtilmemiş
  parcel_coordinates: [ // Convert coordinates to JSON array
    { Nokta: 89, X: 4540345.97, Y: 438538.46 },
    { Nokta: 9, X: 4540358.64, Y: 438539.69 },
    { Nokta: 10, X: 4540362.61, Y: 438544.59 },
    { Nokta: 11, X: 4540359.53, Y: 438561.74 },
    { Nokta: 31, X: 4540343.54, Y: 438560.07 }
  ],
  // Assuming userId and drawingId are not strictly required or using a default/null
  // userId: 1, // Example: Replace with actual user ID if available
  // drawingId: 1, // Example: Replace with actual drawing ID if available
};

async function addAnalysis() {
  console.log('Attempting to insert sample analysis data...');
  try {
    const result = await db.insert(projectAnalyses).values(sampleData).returning();
    console.log('Successfully inserted sample analysis:', result);
  } catch (error) {
    console.error('Error inserting sample analysis:', error);
    process.exit(1); // Exit with error code
  } finally {
    // Ensure the pool connection is closed if db object exposes it
    // Example: await db.pool.end(); or similar if available
    // If using the pool directly from db.ts:
    // import { pool } from '../server/db.js';
    // await pool.end();
    console.log('Script finished.');
  }
}

addAnalysis();
