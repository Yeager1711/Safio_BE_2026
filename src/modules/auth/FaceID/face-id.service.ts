import { BadRequestException, Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';

import { User } from '../../../entities/users.entity';
import { FaceProfile } from '../../../entities/face_profile.entity';
import { FaceEmbedding } from '../../../entities/face_embedding.entity';

import { RegisterFaceDto } from '../dto/register-face.dto';
import { VerifyFaceDto } from './DTO/verify-face.dto';
import { FaceAIService } from './face-ai.service';

@Injectable()
export class FaceIdService {
        private readonly logger = new Logger(FaceIdService.name);

        /**
         * ================================================================
         * FACE MATCHING CONFIG
         * ================================================================
         *
         * Face-api descriptor = 128 dimensions.
         *
         * Với face-api, dùng Euclidean distance thay vì cosine similarity
         * để quyết định match.
         *
         * Không nên hiểu các giá trị này là "95% confidence".
         * Đây là các threshold cần được calibrate tiếp bằng dữ liệu thật.
         */

        /**
         * Khoảng cách tốt nhất của một frame với registered face.
         *
         * Nhỏ hơn = giống hơn.
         */
        private readonly FACE_DISTANCE_THRESHOLD = 0.55;

        /**
         * Khoảng cách tối đa cho embedding thứ 2.
         *
         * Mục đích:
         * Không cho phép chỉ một registered embedding duy nhất
         * kéo cả frame lên PASS.
         */
        private readonly SECOND_BEST_DISTANCE_THRESHOLD = 0.62;

        /**
         * Trung bình của 2 embedding tốt nhất.
         *
         * Giúp chống trường hợp:
         *
         * best = 0.30
         * second = 0.90
         *
         * Nếu chỉ lấy best thì frame sẽ PASS.
         *
         * Với top-2 thì frame bị reject.
         */
        private readonly TOP2_AVERAGE_DISTANCE_THRESHOLD = 0.58;

        /**
         * Threshold consistency giữa các frame verify.
         *
         * 3 frame phải đủ giống nhau về mặt embedding.
         *
         * Đây KHÔNG phải liveness.
         * Nó chỉ đảm bảo 3 frame không quá khác nhau.
         */
        private readonly SELF_DISTANCE_THRESHOLD = 0.48;

        /**
         * Bắt buộc toàn bộ 3 frame phải pass.
         */
        private readonly REQUIRED_PASSED_FRAMES = 3;

        /**
         * Số embedding cần dùng để đánh giá mỗi frame.
         */
        private readonly REQUIRED_TOP_MATCHES = 2;

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

        // ================================================================
        // AGE
        // ================================================================

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

        // ================================================================
        // EMBEDDING VALIDATION
        // ================================================================

        private isValidEmbedding(embedding: unknown): embedding is number[] {
                if (!Array.isArray(embedding)) {
                        return false;
                }

                if (embedding.length !== 128) {
                        return false;
                }

                return embedding.every(
                        (value) => typeof value === 'number' && Number.isFinite(value)
                );
        }

        // ================================================================
        // EUCLIDEAN DISTANCE
        // ================================================================

        /**
         * Face-api descriptor nên được so sánh bằng Euclidean distance.
         *
         * Nhỏ hơn = giống hơn.
         *
         * Ví dụ:
         *
         * 0.30 -> rất gần
         * 0.45 -> gần
         * 0.60 -> bắt đầu đáng nghi
         * 0.80+ -> rất khác
         *
         * Các threshold bên trên chỉ là starting point,
         * cần calibrate bằng dữ liệu thật.
         */
        private euclideanDistance(a: number[], b: number[]): number {
                if (!this.isValidEmbedding(a) || !this.isValidEmbedding(b)) {
                        return Infinity;
                }

                let sum = 0;

                for (let i = 0; i < a.length; i++) {
                        const diff = a[i] - b[i];

                        sum += diff * diff;
                }

                return Math.sqrt(sum);
        }

        // ================================================================
        // DISTANCE -> DISPLAY SCORE
        // ================================================================

        /**
         * Giữ field `confidence` để không phá frontend hiện tại.
         *
         * IMPORTANT:
         * Đây KHÔNG phải xác suất.
         *
         * Chỉ là score tương đối:
         *
         * distance càng nhỏ -> score càng cao.
         */
        private distanceToScore(distance: number): number {
                if (!Number.isFinite(distance)) {
                        return 0;
                }

                const score = 1 - distance;

                return Math.max(0, Math.min(1, score));
        }

        // ================================================================
        // REGISTER FACE
        // ================================================================

        async registerFace(userId: string, dto: RegisterFaceDto) {
                const startTime = Date.now();

                this.logger.log(`========== REGISTER FACE START | USER: ${userId} ==========`);

                // --------------------------------------------------------
                // 1. Validate images
                // --------------------------------------------------------

                if (!dto.images || !Array.isArray(dto.images) || dto.images.length !== 4) {
                        throw new BadRequestException('Cần đủ 4 ảnh khuôn mặt.');
                }

                // --------------------------------------------------------
                // 2. Validate user
                // --------------------------------------------------------

                const user = await this.userRepository.findOne({
                        where: {
                                id: userId,
                        },
                });

                if (!user) {
                        throw new NotFoundException('Không tìm thấy người dùng.');
                }

                // --------------------------------------------------------
                // 3. Validate required angles
                // --------------------------------------------------------

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

                // --------------------------------------------------------
                // 4. Validate base64
                // --------------------------------------------------------

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

                // --------------------------------------------------------
                // 5. Create/update face profile
                // --------------------------------------------------------

                let faceProfile = await this.faceProfileRepository.findOne({
                        where: {
                                user_id: userId,
                        },
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

                // --------------------------------------------------------
                // 6. Generate all 4 embeddings in parallel
                // --------------------------------------------------------

                this.logger.log('Generating 4 registered face embeddings...');

                const embeddingStart = Date.now();

                const results = await Promise.allSettled(
                        dto.images.map(async (item) => {
                                const frameStart = Date.now();

                                this.logger.log(`[REGISTER] ${item.angle} START`);

                                try {
                                        const vector = await this.faceAIService.createEmbedding(
                                                item.image
                                        );

                                        if (!this.isValidEmbedding(vector)) {
                                                throw new Error(
                                                        `Embedding góc ${item.angle} không hợp lệ`
                                                );
                                        }

                                        this.logger.log(
                                                `[REGISTER] ${item.angle} DONE: ${
                                                        Date.now() - frameStart
                                                }ms`
                                        );

                                        return this.faceEmbeddingRepository.create({
                                                face_profile_id: faceProfile.id,

                                                angle: item.angle,

                                                image_url: item.image,

                                                embedding: vector,

                                                confidence: 0,
                                        });
                                } catch (error: any) {
                                        this.logger.error(
                                                `[REGISTER] ${item.angle} FAILED: ${
                                                        error?.message || error
                                                }`
                                        );

                                        throw error;
                                }
                        })
                );

                const embeddingTime = Date.now() - embeddingStart;

                this.logger.log(`[PERF] REGISTER ALL EMBEDDINGS: ${embeddingTime}ms`);

                // --------------------------------------------------------
                // 7. Check all 4 results
                // --------------------------------------------------------

                const embeddings = results
                        .filter(
                                (result): result is PromiseFulfilledResult<FaceEmbedding> =>
                                        result.status === 'fulfilled'
                        )
                        .map((result) => result.value);

                results.forEach((result, index) => {
                        if (result.status === 'rejected') {
                                this.logger.warn(
                                        `[REGISTER] Angle ${dto.images[index].angle} failed: ${
                                                result.reason?.message || result.reason
                                        }`
                                );
                        }
                });

                /**
                 * Registration phải có đủ 4/4.
                 *
                 * Không được lưu một profile có 2/4 hoặc 3/4
                 * rồi dùng nó để verify.
                 */
                if (embeddings.length !== 4) {
                        this.logger.error(
                                `REGISTER FAILED | ${embeddings.length}/4 embeddings generated`
                        );

                        throw new BadRequestException(
                                `Không thể tạo đủ 4 embedding khuôn mặt. Đã xử lý ${
                                        embeddings.length
                                }/4 góc. Vui lòng đăng ký lại với khuôn mặt rõ và không bị che.`
                        );
                }

                // --------------------------------------------------------
                // 8. Validate all embeddings
                // --------------------------------------------------------

                for (const embedding of embeddings) {
                        if (!this.isValidEmbedding(embedding.embedding)) {
                                throw new BadRequestException(
                                        `Embedding góc ${embedding.angle} không hợp lệ.`
                                );
                        }
                }

                // --------------------------------------------------------
                // 9. Xóa embedding cũ CHỈ SAU KHI đã tạo thành công 4 mới
                // --------------------------------------------------------

                await this.faceEmbeddingRepository.delete({
                        face_profile_id: faceProfile.id,
                });

                // --------------------------------------------------------
                // 10. Save new embeddings
                // --------------------------------------------------------

                await this.faceEmbeddingRepository.save(embeddings);

                const totalTime = Date.now() - startTime;

                this.logger.log(`
====================================================
FACE REGISTER SUCCESS
USER:
${userId}

EMBEDDINGS:
${embeddings.map((item) => `- ${item.angle}`).join('\n')}

TOTAL:
${embeddings.length}/4

TIME:
${totalTime}ms
====================================================
                `);

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

        // ================================================================
        // VERIFY FACE
        // ================================================================

        async verifyFace(userId: string, dto: VerifyFaceDto) {
                const startTime = Date.now();

                this.logger.log(`
====================================================
VERIFY FACE START
USER:
${userId}
====================================================
                `);

                // --------------------------------------------------------
                // 1. Validate input
                // --------------------------------------------------------

                if (!dto.images || !Array.isArray(dto.images)) {
                        throw new BadRequestException('Danh sách frame xác thực không hợp lệ.');
                }

                if (dto.images.length !== 3) {
                        throw new BadRequestException('Cần đủ 3 frame xác thực.');
                }

                const images = dto.images;

                for (let i = 0; i < images.length; i++) {
                        const image = images[i];

                        if (!image || !image.startsWith('data:image/')) {
                                throw new BadRequestException(
                                        `Frame ${i + 1} không đúng định dạng Base64.`
                                );
                        }
                }

                // --------------------------------------------------------
                // 2. Get user's face profile
                // --------------------------------------------------------

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
                                message: 'Người dùng chưa đăng ký khuôn mặt.',
                        };
                }

                // --------------------------------------------------------
                // 3. Profile must be registered
                // --------------------------------------------------------

                if (faceProfile.status !== 'registered') {
                        return {
                                success: false,
                                matched: false,
                                confidence: 0,
                                message: 'Face ID của người dùng chưa ở trạng thái đăng ký.',
                        };
                }

                // --------------------------------------------------------
                // 4. Get registered embeddings
                // --------------------------------------------------------

                const registeredFaces = await this.faceEmbeddingRepository.find({
                        where: {
                                face_profile_id: faceProfile.id,
                        },
                });

                if (!registeredFaces || registeredFaces.length !== 4) {
                        this.logger.warn(
                                `Invalid registered face data: ${registeredFaces?.length || 0}/4`
                        );

                        return {
                                success: false,
                                matched: false,
                                confidence: 0,
                                message: 'Dữ liệu Face ID chưa đầy đủ. Vui lòng đăng ký lại khuôn mặt.',
                        };
                }

                // --------------------------------------------------------
                // 5. Validate registered embeddings
                // --------------------------------------------------------

                const validRegisteredFaces = registeredFaces.filter((face) =>
                        this.isValidEmbedding(face.embedding)
                );

                if (validRegisteredFaces.length !== 4) {
                        this.logger.error(
                                `Invalid registered embeddings: ${validRegisteredFaces.length}/4`
                        );

                        return {
                                success: false,
                                matched: false,
                                confidence: 0,
                                message: 'Dữ liệu embedding Face ID không hợp lệ. Vui lòng đăng ký lại.',
                        };
                }

                this.logger.log(`Registered embeddings: ${validRegisteredFaces.length}/4`);

                // --------------------------------------------------------
                // 6. Generate 3 scan embeddings in parallel
                // --------------------------------------------------------

                const embeddingStart = Date.now();

                const results = await Promise.allSettled(
                        images.map(async (image, index) => {
                                const frameStart = Date.now();

                                this.logger.log(`[VERIFY] Frame ${index + 1} START`);

                                try {
                                        const embedding =
                                                await this.faceAIService.createEmbedding(image);

                                        if (!this.isValidEmbedding(embedding)) {
                                                throw new Error('Embedding không hợp lệ.');
                                        }

                                        const frameTime = Date.now() - frameStart;

                                        this.logger.log(
                                                `[VERIFY] Frame ${index + 1} DONE: ${frameTime}ms`
                                        );

                                        return embedding;
                                } catch (error: any) {
                                        const frameTime = Date.now() - frameStart;

                                        this.logger.error(
                                                `[VERIFY] Frame ${
                                                        index + 1
                                                } FAILED: ${frameTime}ms | ${
                                                        error?.message || error
                                                }`
                                        );

                                        throw error;
                                }
                        })
                );

                const embeddingTime = Date.now() - embeddingStart;

                this.logger.log(`[PERF] ALL 3 EMBEDDINGS: ${embeddingTime}ms`);

                // --------------------------------------------------------
                // 7. Require ALL 3 embeddings
                // --------------------------------------------------------

                const scanEmbeddings = results
                        .filter(
                                (result): result is PromiseFulfilledResult<number[]> =>
                                        result.status === 'fulfilled'
                        )
                        .map((result) => result.value);

                results.forEach((result, index) => {
                        if (result.status === 'rejected') {
                                this.logger.warn(
                                        `[VERIFY] Frame ${index + 1} rejected: ${
                                                result.reason?.message || result.reason
                                        }`
                                );
                        }
                });

                /**
                 * Cực kỳ quan trọng:
                 *
                 * Không cho phép:
                 *
                 * frame 1 OK
                 * frame 2 FAIL
                 * frame 3 OK
                 *
                 * rồi vẫn verify.
                 *
                 * Phải đủ 3/3.
                 */
                if (scanEmbeddings.length !== 3) {
                        this.logger.warn(
                                `VERIFY REJECTED: only ${scanEmbeddings.length}/3 valid frames`
                        );

                        return {
                                success: false,
                                matched: false,
                                confidence: 0,
                                message: 'Không thể xử lý đủ 3 frame khuôn mặt. Vui lòng nhìn thẳng vào camera và thử lại.',
                        };
                }

                // --------------------------------------------------------
                // 8. Consistency check
                // --------------------------------------------------------

                const selfDistances: number[] = [];

                for (let i = 0; i < scanEmbeddings.length - 1; i++) {
                        for (let j = i + 1; j < scanEmbeddings.length; j++) {
                                const distance = this.euclideanDistance(
                                        scanEmbeddings[i],
                                        scanEmbeddings[j]
                                );

                                selfDistances.push(distance);

                                this.logger.log(
                                        `[CONSISTENCY] Frame ${i + 1} ↔ Frame ${
                                                j + 1
                                        } = ${distance.toFixed(4)}`
                                );
                        }
                }

                if (selfDistances.length > 0) {
                        const averageSelfDistance =
                                selfDistances.reduce((a, b) => a + b, 0) / selfDistances.length;

                        const maxSelfDistance = Math.max(...selfDistances);

                        this.logger.log(
                                `[CONSISTENCY] AVG DISTANCE: ${averageSelfDistance.toFixed(4)}`
                        );

                        this.logger.log(
                                `[CONSISTENCY] MAX DISTANCE: ${maxSelfDistance.toFixed(4)}`
                        );

                        /**
                         * Không chỉ kiểm tra average.
                         *
                         * Nếu:
                         *
                         * frame1 ↔ frame2 = 0.20
                         * frame1 ↔ frame3 = 0.21
                         * frame2 ↔ frame3 = 0.90
                         *
                         * average có thể vẫn không quá tệ.
                         *
                         * Vì vậy kiểm tra cả MAX.
                         */
                        if (
                                averageSelfDistance > this.SELF_DISTANCE_THRESHOLD ||
                                maxSelfDistance > this.SELF_DISTANCE_THRESHOLD + 0.08
                        ) {
                                this.logger.warn(`VERIFY REJECTED: unstable face frames`);

                                return {
                                        success: false,
                                        matched: false,
                                        confidence: this.distanceToScore(averageSelfDistance),
                                        message: 'Khuôn mặt không ổn định giữa các frame. Vui lòng giữ khuôn mặt ổn định và thử lại.',
                                };
                        }
                }

                // --------------------------------------------------------
                // 9. Match each frame
                // --------------------------------------------------------

                const matchingStart = Date.now();

                interface FrameMatch {
                        frameIndex: number;
                        bestDistance: number;
                        secondBestDistance: number;
                        top2AverageDistance: number;
                        bestAngle: string;
                        passed: boolean;
                }

                const frameMatches: FrameMatch[] = [];

                for (let frameIndex = 0; frameIndex < scanEmbeddings.length; frameIndex++) {
                        const scanEmbedding = scanEmbeddings[frameIndex];

                        const distances: Array<{
                                angle: string;
                                distance: number;
                        }> = [];

                        for (const face of validRegisteredFaces) {
                                const distance = this.euclideanDistance(
                                        scanEmbedding,
                                        face.embedding
                                );

                                if (Number.isFinite(distance)) {
                                        distances.push({
                                                angle: face.angle,
                                                distance,
                                        });
                                }
                        }

                        if (distances.length < this.REQUIRED_TOP_MATCHES) {
                                this.logger.warn(
                                        `Frame ${frameIndex + 1}: insufficient registered matches`
                                );

                                return {
                                        success: false,
                                        matched: false,
                                        confidence: 0,
                                        message: 'Không đủ dữ liệu để so sánh khuôn mặt.',
                                };
                        }

                        // ------------------------------------------------
                        // Sort: nhỏ nhất = giống nhất
                        // ------------------------------------------------

                        distances.sort((a, b) => a.distance - b.distance);

                        const best = distances[0];

                        const second = distances[1];

                        const top2Average = (best.distance + second.distance) / 2;

                        /**
                         * Frame PASS khi:
                         *
                         * 1. Best distance đủ thấp
                         * 2. Second-best cũng không quá xa
                         * 3. Trung bình top-2 đủ thấp
                         *
                         * Điều này chặt hơn Math.max().
                         */
                        const passed =
                                best.distance <= this.FACE_DISTANCE_THRESHOLD &&
                                second.distance <= this.SECOND_BEST_DISTANCE_THRESHOLD &&
                                top2Average <= this.TOP2_AVERAGE_DISTANCE_THRESHOLD;

                        frameMatches.push({
                                frameIndex: frameIndex + 1,

                                bestDistance: best.distance,

                                secondBestDistance: second.distance,

                                top2AverageDistance: top2Average,

                                bestAngle: best.angle,

                                passed,
                        });

                        this.logger.log(`
[FRAME ${frameIndex + 1}]
BEST:
${best.distance.toFixed(4)} (${best.angle})

SECOND:
${second.distance.toFixed(4)}

TOP2 AVG:
${top2Average.toFixed(4)}

RESULT:
${passed ? 'PASS' : 'FAIL'}
                        `);

                        // Debug toàn bộ distances
                        this.logger.debug(
                                `[FRAME ${frameIndex + 1}] ${distances
                                        .map((item) => `${item.angle}=${item.distance.toFixed(4)}`)
                                        .join(' | ')}`
                        );
                }

                const matchingTime = Date.now() - matchingStart;

                this.logger.log(`[PERF] Matching: ${matchingTime}ms`);

                // --------------------------------------------------------
                // 10. Require 3/3 frames
                // --------------------------------------------------------

                const passedFrames = frameMatches.filter((frame) => frame.passed).length;

                /**
                 * Best distance trung bình.
                 */
                const averageBestDistance =
                        frameMatches.reduce((sum, frame) => sum + frame.bestDistance, 0) /
                        frameMatches.length;

                /**
                 * Top2 average trung bình.
                 */
                const averageTop2Distance =
                        frameMatches.reduce((sum, frame) => sum + frame.top2AverageDistance, 0) /
                        frameMatches.length;

                /**
                 * Frame xấu nhất.
                 *
                 * Không cho phép một frame cực kỳ xấu
                 * nhưng hai frame còn lại tốt vẫn PASS.
                 */
                const worstBestDistance = Math.max(
                        ...frameMatches.map((frame) => frame.bestDistance)
                );

                // --------------------------------------------------------
                // 11. Final decision
                // --------------------------------------------------------

                const accepted =
                        frameMatches.length === 3 &&
                        passedFrames === this.REQUIRED_PASSED_FRAMES &&
                        averageBestDistance <= this.FACE_DISTANCE_THRESHOLD &&
                        averageTop2Distance <= this.TOP2_AVERAGE_DISTANCE_THRESHOLD &&
                        worstBestDistance <= this.FACE_DISTANCE_THRESHOLD;

                /**
                 * Score chỉ để frontend hiển thị.
                 *
                 * Không phải xác suất.
                 */
                const confidence = this.distanceToScore(averageBestDistance);

                this.logger.log(`
====================================================
FACE VERIFICATION
USER ID:
${userId}

FRAME RESULTS:
${frameMatches
        .map(
                (frame) =>
                        `Frame ${frame.frameIndex}: ${
                                frame.passed ? 'PASS' : 'FAIL'
                        } | BEST=${frame.bestDistance.toFixed(
                                4
                        )} | SECOND=${frame.secondBestDistance.toFixed(
                                4
                        )} | TOP2=${frame.top2AverageDistance.toFixed(
                                4
                        )} | ANGLE=${frame.bestAngle}`
        )
        .join('\n')}

AVG BEST DISTANCE:
${averageBestDistance.toFixed(4)}

AVG TOP2 DISTANCE:
${averageTop2Distance.toFixed(4)}

WORST BEST DISTANCE:
${worstBestDistance.toFixed(4)}

PASSED:
${passedFrames}/${frameMatches.length}

THRESHOLD BEST:
${this.FACE_DISTANCE_THRESHOLD}

THRESHOLD SECOND:
${this.SECOND_BEST_DISTANCE_THRESHOLD}

THRESHOLD TOP2 AVG:
${this.TOP2_AVERAGE_DISTANCE_THRESHOLD}

RESULT:
${accepted ? 'PASS' : 'FAIL'}

TIME:
${Date.now() - startTime}ms
====================================================
                `);

                // --------------------------------------------------------
                // 12. Reject
                // --------------------------------------------------------

                if (!accepted) {
                        this.logger.warn(`
====================================================
FACE VERIFY FAILED
USER:
${userId}

AVG DISTANCE:
${averageBestDistance.toFixed(4)}

WORST DISTANCE:
${worstBestDistance.toFixed(4)}

PASSED:
${passedFrames}/3

TIME:
${Date.now() - startTime}ms
====================================================
                        `);

                        return {
                                success: false,
                                matched: false,

                                /**
                                 * Giữ field confidence để frontend
                                 * hiện UI cũ.
                                 *
                                 * Đây KHÔNG phải xác suất.
                                 */
                                confidence,

                                message: 'Khuôn mặt không khớp với tài khoản đang đăng nhập.',
                        };
                }

                // --------------------------------------------------------
                // 13. Success
                // --------------------------------------------------------

                this.logger.log(`
====================================================
FACE VERIFICATION SUCCESS
USER:
${userId}

AVG DISTANCE:
${averageBestDistance.toFixed(4)}

AVG TOP2 DISTANCE:
${averageTop2Distance.toFixed(4)}

WORST DISTANCE:
${worstBestDistance.toFixed(4)}

PASSED:
${passedFrames}/3

SCORE:
${confidence.toFixed(4)}

TIME:
${Date.now() - startTime}ms
====================================================
                `);

                return {
                        success: true,
                        matched: true,

                        /**
                         * Compatibility với frontend hiện tại.
                         *
                         * Không phải probability.
                         */
                        confidence,

                        message: 'Xác thực khuôn mặt thành công.',
                };
        }

        // ================================================================
        // GET FACE PROFILE
        // ================================================================

        async getFaceProfile(userId: string) {
                const profile = await this.faceProfileRepository.findOne({
                        where: {
                                user_id: userId,
                        },

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

                                        age_text: userAge !== null ? `${userAge} tuổi` : null,
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

        // ================================================================
        // DELETE FACE
        // ================================================================

        async deleteFace(userId: string) {
                const profile = await this.faceProfileRepository.findOne({
                        where: {
                                user_id: userId,
                        },
                });

                if (!profile) {
                        throw new NotFoundException('Người dùng chưa đăng ký khuôn mặt.');
                }

                await this.faceEmbeddingRepository.delete({
                        face_profile_id: profile.id,
                });

                await this.faceProfileRepository.delete(profile.id);

                this.logger.log(`FACE PROFILE DELETED | USER: ${userId}`);

                return {
                        success: true,
                        message: 'Đã xoá dữ liệu khuôn mặt.',
                };
        }
}
