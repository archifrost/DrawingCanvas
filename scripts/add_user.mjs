import { db } from '../server/db.js';
import { users } from '../shared/schema.js';
// import bcrypt from 'bcrypt'; // We might need bcrypt if password hashing is done on insert

// User data (replace with desired username/password)
const userData = {
  id: 1, // Explicitly set ID to 1
  username: 'testuser',
  // Hash the password before inserting if the application expects hashed passwords
  // For simplicity, let's insert a plain password for now, assuming no hashing trigger
  // or handle hashing if necessary (might require installing bcrypt: npm install bcrypt @types/bcrypt)
  password: 'password123' 
};

async function addUser() {
  console.log(`Attempting to insert user with ID ${userData.id}...`);
  try {
    // Check if bcrypt is needed and hash password
    // const saltRounds = 10;
    // const hashedPassword = await bcrypt.hash(userData.password, saltRounds);
    // userData.password = hashedPassword;

    const result = await db.insert(users).values(userData).returning();
    console.log('Successfully inserted user:', result);
  } catch (error) {
    // Check if user already exists (unique constraint violation)
    if (error.code === '23505') { // PostgreSQL unique violation code
       console.log(`User with ID ${userData.id} or username ${userData.username} already exists.`);
    } else {
      console.error('Error inserting user:', error);
      process.exit(1); // Exit with error code
    }
  } finally {
    console.log('Script finished.');
    // Optional: Close pool connection if needed
  }
}

addUser();
