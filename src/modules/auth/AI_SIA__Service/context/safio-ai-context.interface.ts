export interface SafioAIContext {
        userInfo?: {
                full_name?: string;
                email?: string;
                phone_number?: string;
                date_of_birth?: string | Date;
                require_face_id?: boolean;
                role?: string;
                createdAt?: string | Date;
        };

        cameras?: Array<{
                id: string;
                cam_name: string;
                location: string;
                camera_type: 'IP' | 'Ezviz' | 'Imou';
                status: string;
                createdAt: Date | string;
                createdByName?: string;
                createdById?: string;
        }>;

        faceProfile?: {
                status: string;
                registered_at: Date | string | null;
                hasEmbeddings: boolean;
        };

        fallStats?: {
                total: number;
                level1: number;
                level2: number;
                level3: number;
                latest?: {
                        createdAt: Date | string;
                        cameraName?: string;
                        level?: string | number;
                        snapshot_url?: string;
                };
        };

        fallEvents?: Array<{
                id?: string;
                createdAt: Date | string;
                level: string | number;
                cameraName?: string;
                personName?: string;
                snapshot_url?: string;
                description?: string;
        }>;

        /** Ghi chú khi ngày được hỏi không có sự kiện → fallback sự kiện gần nhất */
        fallDateNote?: string;

        familyMembers?: Array<{
                full_name: string;
                relationship?: string;
        }>;
}
