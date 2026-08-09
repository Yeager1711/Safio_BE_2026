import { BadRequestException, Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';

import { User } from '../../../entities/users.entity';
import { FaceProfile } from '../../../entities/face_profile.entity';
import { FaceEmbedding } from '../../../entities/face_embedding.entity';

import { RegisterFaceDto } from '../dto/register-face.dto';
import { VerifyFaceDto } from '../dto/verify-face.dto';
import { FaceAIService } from './face-ai.service';

@Injectable()
export class FaceIdService {
        private readonly logger = new Logger(FaceIdService.name);
        private readonly FACE_THRESHOLD = 0.72;

        constructor(
                @InjectRepository(User)
                private readonly userRepository: Repository<User>,

                @InjectRepository(FaceProfile)
                private readonly faceProfileRepository: Repository<FaceProfile>,

                @InjectRepository(FaceEmbedding)
                private readonly faceEmbeddingRepository: Repository<FaceEmbedding>,

                private readonly jwtService: JwtService,

                private readonly faceAIService: FaceAIService
        ) {}

        private calculateAge(dateOfBirth: Date | string | null): number | null {
                if (!dateOfBirth) return null;

                const birthDate = new Date(dateOfBirth);
                const today = new Date();

                let age = today.getFullYear() - birthDate.getFullYear();
                const monthDiff = today.getMonth() - birthDate.getMonth();

                if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
                        age--;
                }

                return age;
        }

        /**
         * REGISTER FACE
         */
        async registerFace(userId: string, dto: RegisterFaceDto) {
                if (!dto.images || dto.images.length !== 4) {
                        throw new BadRequestException('Cần đủ 4 ảnh khuôn mặt.');
                }

                const user = await this.userRepository.findOne({ where: { id: userId } });
                if (!user) {
                        throw new NotFoundException('Không tìm thấy người dùng.');
                }

                const requiredAngles = ['front', 'left', 'right', 'up'];
                const receivedAngles = dto.images.map((item) => item.angle);
                const uniqueAngles = new Set(receivedAngles);

                if (uniqueAngles.size !== 4) {
                        throw new BadRequestException('Bốn góc khuôn mặt phải khác nhau.');
                }

                for (const angle of requiredAngles) {
                        if (!uniqueAngles.has(angle as any)) {
                                throw new BadRequestException(`Thiếu góc khuôn mặt: ${angle}`);
                        }
                }

                for (const item of dto.images) {
                        if (!item.image) {
                                throw new BadRequestException(
                                        `Ảnh góc ${item.angle} không hợp lệ.`
                                );
                        }
                        if (!item.image.startsWith('data:image/')) {
                                throw new BadRequestException(
                                        `Ảnh góc ${item.angle} không đúng Base64.`
                                );
                        }
                }

                let faceProfile = await this.faceProfileRepository.findOne({
                        where: { user_id: userId },
                });

                if (!faceProfile) {
                        faceProfile = this.faceProfileRepository.create({
                                user_id: userId,
                                status: 'registered',
                                registered_at: new Date(),
                        });
                } else {
                        faceProfile.status = 'registered';
                        faceProfile.registered_at = new Date();
                }

                faceProfile = await this.faceProfileRepository.save(faceProfile);

                // Xóa embedding cũ
                await this.faceEmbeddingRepository.delete({
                        face_profile_id: faceProfile.id,
                });

                // ========== SỬA: dùng Promise.allSettled ==========
                const results = await Promise.allSettled(
                        dto.images.map(async (item) => {
                                const vector = await this.faceAIService.createEmbedding(item.image);

                                return this.faceEmbeddingRepository.create({
                                        face_profile_id: faceProfile.id,
                                        angle: item.angle,
                                        image_url: item.image,
                                        embedding: vector,
                                        confidence: 0,
                                });
                        })
                );

                const embeddings = results
                        .filter((r) => r.status === 'fulfilled')
                        .map((r) => (r as PromiseFulfilledResult<FaceEmbedding>).value);

                // Log các góc bị fail
                results.forEach((r, index) => {
                        if (r.status === 'rejected') {
                                this.logger.warn(
                                        `Góc ${dto.images[index].angle} fail: ${r.reason?.message || r.reason}`
                                );
                        }
                });

                // if (embeddings.length < 2) {
                //         throw new BadRequestException(
                //                 `Chỉ detect được ${embeddings.length}/4 góc khuôn mặt. Hãy thử lại với ánh sáng tốt hơn và giữ mặt rõ hơn.`
                //         );
                // }

                if (embeddings.length !== 4) {
                        throw new BadRequestException('Cần đủ 4 góc khuôn mặt');
                }

                await this.faceEmbeddingRepository.save(embeddings);

                return {
                        success: true,
                        message: `Đăng ký khuôn mặt thành công (${embeddings.length}/4 góc).`,
                        data: {
                                user_id: user.id,
                                face_profile_id: faceProfile.id,
                                status: faceProfile.status,
                                angles: embeddings.map((e) => e.angle),
                                total_registered: embeddings.length,
                        },
                };
        }

        /**
         * VERIFY FACE
         */
        async verifyFace(dto: VerifyFaceDto) {
                const startTime = Date.now();
                this.logger.log('========== VERIFY FACE START ==========');

                if (!dto.images || !Array.isArray(dto.images) || dto.images.length === 0) {
                        throw new BadRequestException('Cần ít nhất 1 ảnh khuôn mặt');
                }

                if (dto.images.length !== 3) {
                        throw new BadRequestException('Cần đủ 3 frame xác thực');
                }

                const images = dto.images;

                for (const img of images) {
                        if (!img || !img.startsWith('data:image/')) {
                                throw new BadRequestException('Ảnh không đúng định dạng Base64');
                        }
                }

                // 1. Tạo embedding từ các frame
                const scanEmbeddings: number[][] = [];

                for (let i = 0; i < images.length; i++) {
                        try {
                                const embedding = await this.faceAIService.createEmbedding(
                                        images[i]
                                );

                                if (!this.faceAIService.validateEmbedding(embedding)) {
                                        this.logger.warn(`Frame ${i + 1} embedding không hợp lệ`);
                                        continue;
                                }

                                scanEmbeddings.push(embedding);

                                scanEmbeddings.push(embedding);

                                this.logger.log(`
                                        ==============================
                                        FRAME ${i + 1}

                                        Embedding length:
                                        ${embedding.length}

                                        First 10 values:
                                        ${embedding.slice(0, 10)}

                                        ==============================
                                `);
                        } catch (error: any) {
                                this.logger.error(
                                        `Frame ${i + 1} error: ${error?.message || error}`
                                );
                        }
                }

                if (scanEmbeddings.length === 0) {
                        return {
                                success: false,
                                matched: false,
                                message: 'Không xử lý được khuôn mặt từ các frame',
                        };
                }

                // 2. Kiểm tra consistency giữa các frame
                if (scanEmbeddings.length >= 2) {
                        const similarities: number[] = [];

                        for (let i = 0; i < scanEmbeddings.length - 1; i++) {
                                for (let j = i + 1; j < scanEmbeddings.length; j++) {
                                        similarities.push(
                                                this.faceAIService.cosineSimilarity(
                                                        scanEmbeddings[i],
                                                        scanEmbeddings[j]
                                                )
                                        );
                                }
                        }

                        const avgSelfSimilarity =
                                similarities.reduce((a, b) => a + b, 0) / similarities.length;

                        this.logger.log(
                                `Self-similarity (frames): ${avgSelfSimilarity.toFixed(4)}`
                        );

                        if (avgSelfSimilarity < 0.8) {
                                return {
                                        success: false,
                                        matched: false,
                                        message: 'Khuôn mặt không ổn định (có thể là ảnh tĩnh hoặc chuyển động mạnh)',
                                };
                        }
                }

                // 3. Lấy toàn bộ embedding đã đăng ký
                const faceEmbeddings = await this.faceEmbeddingRepository.find({
                        relations: {
                                faceProfile: {
                                        user: true,
                                },
                        },
                });

                if (faceEmbeddings.length === 0) {
                        return {
                                success: false,
                                matched: false,
                                message: 'Chưa có dữ liệu khuôn mặt nào trong hệ thống',
                        };
                }

                // 4. So sánh
                const userScores = new Map<string, { scores: number[]; faces: FaceEmbedding[] }>();

                for (const scanEmbedding of scanEmbeddings) {
                        for (const face of faceEmbeddings) {
                                if (!face.embedding || !Array.isArray(face.embedding)) continue;

                                const score = this.faceAIService.cosineSimilarity(
                                        scanEmbedding,
                                        face.embedding
                                );

                                this.logger.log(`
                                        ANGLE: ${face.angle}
                                        SCORE: ${score}

                                        SCAN:
                                        ${scanEmbedding.slice(0, 5)}

                                        REGISTER:
                                        ${face.embedding.slice(0, 5)}
                                `);

                                const userId = face.faceProfile?.user?.id;
                                if (!userId) continue;

                                if (!userScores.has(userId)) {
                                        userScores.set(userId, { scores: [], faces: [] });
                                }

                                userScores.get(userId)!.scores.push(score);
                                userScores.get(userId)!.faces.push(face);
                        }
                }

                let bestUserId: string | null = null;
                let bestAverage = 0;

                for (const [userId, data] of userScores) {
                        const scores = data.scores;

                        if (scores.length === 0) continue;

                        // Điểm trung bình tất cả embedding của user
                        const average = scores.reduce((a, b) => a + b, 0) / scores.length;

                        // Bao nhiêu embedding đạt threshold
                        const passedCount = scores.filter((s) => s >= this.FACE_THRESHOLD).length;

                        const user = data.faces[0]?.faceProfile?.user;

                        this.logger.log(`
                        ===============================
                        USER: ${user?.full_name}
                        ID: ${userId}

                        AVG:
                        ${average.toFixed(4)}

                        PASS:
                        ${passedCount}/${scores.length}
                        ===============================
                        `);

                        /**
                         * Không dùng maxScore nữa
                         * Phải tất cả frame đều đạt
                         */
                        const accepted = average >= 0.75 && passedCount === scores.length;

                        if (accepted && average > bestAverage) {
                                bestAverage = average;
                                bestUserId = userId;
                        }
                }

                if (!bestUserId) {
                        this.logger.warn(
                                `FACE VERIFY FAILED | MAX: ${bestAverage.toFixed(4)} | TIME: ${Date.now() - startTime}ms`
                        );

                        return {
                                success: false,
                                matched: false,
                                confidence: bestAverage,
                                message: 'Khuôn mặt không trùng khớp',
                        };
                }

                // 5. Lấy user + JWT
                const user = await this.userRepository.findOne({
                        where: { id: bestUserId },
                        relations: ['role'],
                });

                if (!user) {
                        return {
                                success: false,
                                matched: false,
                                message: 'Không tìm thấy người dùng',
                        };
                }

                const token = this.jwtService.sign({
                        user_id: user.id,
                        email: user.email,
                });

                this.logger.log(`
                        AUTHENTICATION SUCCESS

                        AVG:
                        ${bestAverage.toFixed(4)}

                        TIME:
                        ${Date.now() - startTime}ms
                `);

                return {
                        success: true,
                        matched: true,
                        confidence: bestAverage,
                        token,
                        user: {
                                id: user.id,
                                name: user.full_name,
                                email: user.email,
                        },
                };
        }

        /**
         * Lấy thông tin face profile của user
         */
        async getFaceProfile(userId: string) {
                const profile = await this.faceProfileRepository.findOne({
                        where: { user_id: userId },
                        relations: {
                                user: true,
                                embeddings: true,
                        },
                });

                if (!profile) {
                        throw new NotFoundException('Người dùng chưa đăng ký khuôn mặt.');
                }

                const userAge = this.calculateAge(profile.user.date_of_birth);

                return {
                        success: true,
                        data: {
                                id: profile.id,
                                user_id: profile.user_id,
                                user: {
                                        id: profile.user.id,
                                        name: profile.user.full_name,
                                        email: profile.user.email,
                                        phone: profile.user.phone_number,
                                        role: profile.user.role?.name,
                                        date_of_birth: profile.user.date_of_birth,
                                        age: userAge,
                                        age_text: userAge ? `${userAge} tuổi` : null,
                                },
                                status: profile.status,
                                registered_at: profile.registered_at,
                                embeddings: profile.embeddings.map((item) => ({
                                        id: item.id,
                                        angle: item.angle,
                                        image: item.image_url,
                                        has_embedding: Boolean(item.embedding),
                                        confidence: item.confidence,
                                })),
                        },
                };
        }

        /**
         * Xóa dữ liệu khuôn mặt của user
         */
        async deleteFace(userId: string) {
                const profile = await this.faceProfileRepository.findOne({
                        where: { user_id: userId },
                });

                if (!profile) {
                        throw new NotFoundException('Người dùng chưa đăng ký khuôn mặt.');
                }

                await this.faceEmbeddingRepository.delete({
                        face_profile_id: profile.id,
                });

                await this.faceProfileRepository.delete(profile.id);

                return {
                        success: true,
                        message: 'Đã xoá dữ liệu khuôn mặt.',
                };
        }
}
