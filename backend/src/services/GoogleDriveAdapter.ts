import { google } from 'googleapis';

export class GoogleDriveAdapter {
    private drive: any;
    private folderId: string | undefined;

    constructor(customParams?: { folderId: string, keyFile: string }) {
        if (customParams) {
            if (!customParams.folderId || !customParams.keyFile) {
                console.warn('⚠️ Thunder Drive: folderId or keyFile missing. Thunder image sync will be skipped.');
                return;
            }
            try {
                this.folderId = customParams.folderId;
                const auth = new google.auth.GoogleAuth({
                    keyFile: customParams.keyFile,
                    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
                });
                this.drive = google.drive({ version: 'v3', auth });
            } catch (err) {
                console.error('❌ Failed to initialize Thunder GoogleDriveAdapter:', err);
            }
        } else {
            this.folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
            const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;

            if (!this.folderId || !keyFile) {
                console.warn('⚠️ Google Drive credentials missing. Image overrides will be skipped.');
                return;
            }

            try {
                const auth = new google.auth.GoogleAuth({
                    keyFile: keyFile,
                    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
                });
                this.drive = google.drive({ version: 'v3', auth });
            } catch (err) {
                console.error('❌ Failed to initialize default GoogleDriveAdapter:', err);
            }
        }
    }

    async findImageOverride(modelNumber: string): Promise<{ mimeType: string, base64: string } | null> {
        if (!this.drive || !this.folderId) return null;

        try {
            const query = `'${this.folderId}' in parents and name contains '${modelNumber}' and trashed = false`;

            const res = await this.drive.files.list({
                q: query,
                fields: 'files(id, name, mimeType)', // Fetch mimeType too
                pageSize: 1
            });

            const files = res.data.files;
            if (files && files.length > 0) {
                const file = files[0];
                console.log(`Found image override for ${modelNumber}: ${file.name}`);

                try {
                    const response = await this.drive.files.get(
                        { fileId: file.id, alt: 'media' },
                        { responseType: 'arraybuffer' }
                    );

                    const base64 = Buffer.from(response.data).toString('base64');
                    return {
                        mimeType: file.mimeType,
                        base64: base64
                    };

                } catch (downloadError) {
                    console.error(`Failed to download override image for ${modelNumber}:`, downloadError);
                    return null;
                }
            }

            return null;
        } catch (error) {
            console.error(`Error searching Drive for ${modelNumber}:`, error);
            return null;
        }
    }

    /**
     * Finds multiple images matching a model number, considering complex delimiters (e.g. Thunder)
     * Matches patterns like: "Model1 & Model2_1.jpg", "Model1 (Option)", etc.
     */
    async findMultiImageOverrides(modelNumber: string): Promise<{ mimeType: string, base64: string, name: string }[]> {
        if (!this.drive || !this.folderId) return [];

        try {
            // Fetch a somewhat broad query, then filter precisely in code
            // Drive API's 'contains' is not regex-aware, so we pull files that roughly match
            // or just pull everything if the folder isn't massive (assuming it's not huge for one manufacturer)
            // But to be safe, we'll try to find any file that contains the model string as a fast filter,
            // then verify with strict regex.
            const query = `'${this.folderId}' in parents and name contains '${modelNumber}' and trashed = false`;
            
            const res = await this.drive.files.list({
                q: query,
                fields: 'files(id, name, mimeType)',
                pageSize: 100 // up to 100 images per model
            });

            const files = res.data.files;
            if (!files || files.length === 0) return [];

            const matchedImages: { mimeType: string, base64: string, name: string }[] = [];

            // Escape model number for safe regex, but handle standard alphanumeric
            const safeModel = modelNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            
            // Regex explanations:
            // (^|[\s_&()-])   -> Starts with string beginning OR a delimiter (space, _, &, (, ), -)
            // safeModel       -> The actual model number
            // ([\s_&().-]|$)  -> Ends with a delimiter OR string end
            const exactModelRegex = new RegExp(`(^|[\\s_&()\\-])${safeModel}([\\s_&().\\-]|$)`, 'i');

            console.log(`Analyzing ${files.length} potential Drive matches for model: ${modelNumber}`);

            for (const file of files) {
                if (file.name && exactModelRegex.test(file.name)) {
                    console.log(`✅ Regex Matched: ${file.name} for model ${modelNumber}`);
                    
                    try {
                        const response = await this.drive.files.get(
                            { fileId: file.id, alt: 'media' },
                            { responseType: 'arraybuffer' }
                        );

                        const base64 = Buffer.from(response.data).toString('base64');
                        matchedImages.push({
                            mimeType: file.mimeType || 'image/jpeg',
                            base64: base64,
                            name: file.name
                        });

                    } catch (downloadError) {
                        console.error(`❌ Failed to download multi-override image ${file.name}:`, downloadError);
                    }
                } else {
                    console.log(`⏭️ Regex Rejected (Partial match only): ${file.name}`);
                }
            }

            return matchedImages;

        } catch (error) {
            console.error(`Error searching multi-Drive for ${modelNumber}:`, error);
            return [];
        }
    }

    async getAllImageModels(): Promise<string[]> {
        if (!this.drive || !this.folderId) return [];

        try {
            const query = `'${this.folderId}' in parents and trashed = false`;
            const res = await this.drive.files.list({
                q: query,
                fields: 'files(name)',
                pageSize: 1000 // Reasonable limit for now
            });

            const files = res.data.files;
            if (!files || files.length === 0) return [];

            const models = files
                .map((f: any) => f.name)
                .filter((name: string) => name) // filter nulls
                .map((name: string) => {
                    // Strip extension (e.g. FAT16.jpg -> FAT16)
                    return name.replace(/\.[^/.]+$/, "");
                });

            console.log(`Found ${models.length} image overrides in Drive.`);
            return Array.from(new Set(models)); // Unique only

        } catch (error) {
            console.error('Error listing Drive files:', error);
            return [];
        }
    }
}
