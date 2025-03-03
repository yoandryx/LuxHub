/* global use, db */
// MongoDB Playground
// To disable this template go to Settings | MongoDB | Use Default Template For Playground.
// Make sure you are connected to enable completions and to be able to run a playground.
// Use Ctrl+Space inside a snippet or a string literal to trigger completions.
// The result of the last command run in a playground is shown on the results panel.
// By default the first 20 documents will be returned with a cursor.
// Use 'console.log()' to print to the debug output.
// For more documentation on playgrounds please refer to
// https://www.mongodb.com/docs/mongodb-vscode/playgrounds/

// Select the database to use.
use('Mercatus');

// Insert a few documents into the listings collection.
db.getCollection('listings').insertMany([
  { title: 'Luxury Watch', price: '12 SOL', category: 'watches', owner: 'someOwnerId', status: 'pending', approved: 'true' },
  { title: 'Sneakers', price: '8 SOL', category: 'shoes', owner: 'someOwnerId', status: 'approved', approved: 'true' }
]);

// Run Queries on Listings Collection:
// Example to find listings in the watches category
const watchListings = db.getCollection('listings').find({ category: 'watches' }).toArray();
watchListings;



// Here we run an aggregation and open a cursor to the results.
// Use '.toArray()' to exhaust the cursor to return the whole result set.
// You can use '.hasNext()/.next()' to iterate through the cursor page by page.
// db.getCollection('sales').aggregate([
//   // Find all of the sales that occurred in 2014.
//   { $match: { date: { $gte: new Date('2014-01-01'), $lt: new Date('2015-01-01') } } },
//   // Group the total sales for each product.
//   { $group: { _id: '$item', totalSaleAmount: { $sum: { $multiply: [ '$price', '$quantity' ] } } } }
// ]);
