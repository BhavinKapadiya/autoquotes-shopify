import mongoose from 'mongoose';

export class Database {
    private static instance: Database;
    private uri: string;

    private constructor() {
        this.uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/aq-shopify';
    }

    public static getInstance(): Database {
        if (!Database.instance) {
            Database.instance = new Database();
        }
        return Database.instance;
    }

    public async connect(): Promise<void> {
        try {
            await mongoose.connect(this.uri);
            console.log('✅ Connected to MongoDB');
        } catch (error) {
            console.error('❌ MongoDB Connection Error:', error);
            process.exit(1);
        }
    }

    public async disconnect(): Promise<void> {
        await mongoose.disconnect();
        console.log('MongoDB Disconnected');
    }
}
