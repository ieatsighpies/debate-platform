// MongoDB initialization script for Docker
db.auth('admin', 'password');

// Create debate-db and initial collections if they don't exist
db = db.getSiblingDB('debate-db');

// Create collections with validation
db.createCollection('users', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['username'],
      properties: {
        username: { bsonType: 'string' },
        password: { bsonType: 'string' },
        role: {
          bsonType: 'string',
          enum: ['admin', 'participant']
        },
        isGuest: { bsonType: 'bool' },
        createdAt: { bsonType: 'date' },
        updatedAt: { bsonType: 'date' }
      }
    }
  }
});

db.createCollection('debates', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['topicId', 'gameMode', 'player1UserId'],
      properties: {
        topicId: { bsonType: 'int' },
        gameMode: {
          bsonType: 'string',
          enum: ['human-human', 'human-ai']
        },
        status: {
          bsonType: 'string',
          enum: ['waiting', 'active', 'survey_pending', 'completed', 'abandoned']
        },
        player1UserId: { bsonType: 'objectId' },
        player2UserId: { bsonType: ['objectId', 'null'] },
        createdAt: { bsonType: 'date' }
      }
    }
  }
});

// Create indexes for performance
db.users.createIndex({ username: 1 }, { unique: true });
db.users.createIndex({ isGuest: 1 });
db.users.createIndex({ createdAt: -1 });

db.debates.createIndex({ status: 1 });
db.debates.createIndex({ player1UserId: 1, createdAt: -1 });
db.debates.createIndex({ player2UserId: 1, createdAt: -1 });
db.debates.createIndex({ createdAt: -1 });
db.debates.createIndex({ status: 1, createdAt: -1 });

console.log('Database initialization complete');
