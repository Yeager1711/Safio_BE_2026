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
        async verifyFace(userId: string, dto: VerifyFaceDto) {
                const startTime = Date.now();

                this.logger.log(`========== VERIFY FACE START | USER: ${userId} ==========`);

                // =========================================================
                // 1. Validate input
                // =========================================================

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

                // =========================================================
                // 2. Lấy face profile CỦA USER ĐANG ĐĂNG NHẬP
                // =========================================================

                const faceProfile = await this.faceProfileRepository.findOne({
                        where: {
                                user_id: userId,
                        },
                });

                if (!faceProfile) {
                        return {
                                success: false,
                                matched: false,
                                confidence: 0,
                                message: 'Người dùng chưa đăng ký khuôn mặt',
                        };
                }

                // =========================================================
                // 3. Lấy embeddings CỦA CHÍNH USER NÀY
                // =========================================================

                const registeredFaces = await this.faceEmbeddingRepository.find({
                        where: {
                                face_profile_id: faceProfile.id,
                        },
                });

                if (!registeredFaces || registeredFaces.length === 0) {
                        return {
                                success: false,
                                matched: false,
                                confidence: 0,
                                message: 'Người dùng chưa có dữ liệu khuôn mặt',
                        };
                }

                this.logger.log(`Registered embeddings: ${registeredFaces.length}`);

                // =========================================================
                // 4. Tạo embedding cho 3 frame
                // =========================================================

                // =========================================================
                // 4. Tạo embedding cho 3 frame - PARALLEL
                // =========================================================

                const embeddingStart = Date.now();

                const results = await Promise.allSettled(
                        images.map(async (image, index) => {
                                const frameStart = Date.now();

                                this.logger.log(`[PERF] Frame ${index + 1} START`);

                                try {
                                        const embedding =
                                                await this.faceAIService.createEmbedding(image);

                                        const frameTime = Date.now() - frameStart;

                                        this.logger.log(
                                                `[PERF] Frame ${index + 1} DONE: ${frameTime}ms`
                                        );

                                        return embedding;
                                } catch (error: any) {
                                        const frameTime = Date.now() - frameStart;

                                        this.logger.error(
                                                `[PERF] Frame ${index + 1} FAILED: ${frameTime}ms | ${
                                                        error?.message || error
                                                }`
                                        );

                                        throw error;
                                }
                        })
                );

                const embeddingTime = Date.now() - embeddingStart;

                this.logger.log(`[PERF] ALL 3 EMBEDDINGS: ${embeddingTime}ms`);

                const scanEmbeddings = results
                        .filter(
                                (r): r is PromiseFulfilledResult<number[]> =>
                                        r.status === 'fulfilled'
                        )
                        .map((r) => r.value);

                this.logger.log(`[PERF] Embedding: ${Date.now() - embeddingStart}ms`);

                if (scanEmbeddings.length === 0) {
                        return {
                                success: false,
                                matched: false,
                                confidence: 0,
                                message: 'Không xử lý được khuôn mặt từ các frame',
                        };
                }

                // =========================================================
                // 5. Kiểm tra consistency giữa 3 frame
                // =========================================================

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

                        this.logger.log(`Self-similarity: ${avgSelfSimilarity.toFixed(4)}`);

                        if (avgSelfSimilarity < 0.8) {
                                return {
                                        success: false,
                                        matched: false,
                                        confidence: avgSelfSimilarity,
                                        message: 'Khuôn mặt không ổn định',
                                };
                        }
                }

                // =========================================================
                // 6. So sánh CHỈ với khuôn mặt của user hiện tại
                // =========================================================

                const matchingStart = Date.now();

                const frameScores: number[] = [];

                for (const scanEmbedding of scanEmbeddings) {
                        const scoresForFrame: number[] = [];

                        for (const face of registeredFaces) {
                                if (!face.embedding || !Array.isArray(face.embedding)) {
                                        continue;
                                }

                                const score = this.faceAIService.cosineSimilarity(
                                        scanEmbedding,
                                        face.embedding
                                );

                                scoresForFrame.push(score);

                                this.logger.debug(
                                        `ANGLE: ${face.angle} | SCORE: ${score.toFixed(4)}`
                                );
                        }

                        if (scoresForFrame.length === 0) {
                                continue;
                        }

                        // Frame được xem là match với embedding
                        // tốt nhất của chính user này.
                        const bestFrameScore = Math.max(...scoresForFrame);

                        frameScores.push(bestFrameScore);
                }

                this.logger.log(`[PERF] Matching: ${Date.now() - matchingStart}ms`);

                if (frameScores.length === 0) {
                        return {
                                success: false,
                                matched: false,
                                confidence: 0,
                                message: 'Không thể so sánh khuôn mặt',
                        };
                }

                // =========================================================
                // 7. Tính confidence
                // =========================================================

                const average = frameScores.reduce((a, b) => a + b, 0) / frameScores.length;

                const passedFrames = frameScores.filter(
                        (score) => score >= this.FACE_THRESHOLD
                ).length;

                this.logger.log(`
        ===============================
        FACE VERIFICATION
        USER ID: ${userId}

        FRAME SCORES:
        ${frameScores.map((s) => s.toFixed(4)).join(', ')}

        AVG:
        ${average.toFixed(4)}

        PASS:
        ${passedFrames}/${frameScores.length}

        ===============================
    `);

                // =========================================================
                // 8. Quyết định xác thực
                // =========================================================

                const accepted = average >= 0.75 && passedFrames === frameScores.length;

                if (!accepted) {
                        this.logger.warn(
                                `FACE VERIFY FAILED | USER: ${userId} | AVG: ${average.toFixed(4)} | TIME: ${
                                        Date.now() - startTime
                                }ms`
                        );

                        return {
                                success: false,
                                matched: false,
                                confidence: average,
                                message: 'Khuôn mặt không khớp với tài khoản đang đăng nhập',
                        };
                }

                // =========================================================
                // 9. Xác thực thành công
                // =========================================================

                this.logger.log(`
                        ===============================
                        FACE VERIFICATION SUCCESS

                        USER ID:
                        ${userId}

                        AVG:
                        ${average.toFixed(4)}

                        PASS:
                        ${passedFrames}/${frameScores.length}

                        TIME:
                        ${Date.now() - startTime}ms

                        ===============================
                `);

                return {
                        success: true,
                        matched: true,
                        confidence: average,
                        message: 'Xác thực khuôn mặt thành công',
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
