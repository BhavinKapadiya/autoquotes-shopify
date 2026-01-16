import { google } from 'googleapis';

export class GoogleDriveAdapter {
    private drive: any;
    private folderId: string | undefined;

    constructor() {
        this.folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
        const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;

        if (!this.folderId || !keyFile) {
            console.warn('⚠️ Google Drive credentials missing. Image overrides will be skipped.');
            return;
        }

        const auth = new google.auth.GoogleAuth({
            keyFile: keyFile,
            scopes: ['https://www.googleapis.com/auth/drive.readonly'],
        });

        this.drive = google.drive({ version: 'v3', auth });
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

                // Download file as stream/buffer to converting to Base64
                // This bypasses the need for the file to be "Public", as the Service Account has access.
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
}
