// Migration script: addDefaultTagsToExistingProducts.js
// Run with: node Backend/scripts/addDefaultTagsToExistingProducts.js

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Product } from '../Models/Product.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Load environment variables from the Backend .env file
const envPath = path.resolve(__dirname, '..', '.env');
dotenv.config({ path: envPath });

const DEFAULT_TAGS = ["karachi", "pakistan", "onlineshopping", "viral", "irhasinn"];

async function addMissingTags() {
  await mongoose.connect(process.env.MONGO, {});
  console.log('Connected to MongoDB');

  const products = await Product.find();
  let updatedCount = 0;

  for (const prod of products) {
    const currentTags = prod.tags || [];
    const lowerSet = new Set(currentTags.map(t => t.toLowerCase()));
    const missing = DEFAULT_TAGS.filter(t => !lowerSet.has(t.toLowerCase()));
    if (missing.length) {
      prod.tags = [...currentTags, ...missing];
      await prod.save();
      updatedCount++;
    }
  }

  console.log(`Migration complete. Updated ${updatedCount} product(s).`);
  await mongoose.disconnect();
}

addMissingTags().catch(err => {
  console.error('Migration error:', err);
  process.exit(1);
});
