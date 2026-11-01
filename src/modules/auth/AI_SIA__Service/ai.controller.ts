import {
        BadRequestException,
        Controller,
        Post,
        Body,
        Req,
        UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AI_Service } from './ai.service';
import { SafioAIContext } from './ai.service'; // hoặc đường dẫn file interface của bạn

import { User } from '../../../entities/users.entity';
import { Camera } from '../../../entities/camera.entity';
import { FaceProfile } from '../../../entities/face_profile.entity';
import { ActiveLog } from '../../../entities/active_logs.entity';
import { FamilyMember } from '../../../entities/family-member.entity';
import { FamilyGroup } from '../../../entities/family-group.entity';

interface AuthenticatedRequest extends Request {
        user?: {
                user_id: string;
                email: string;
                role: string;
                full_name?: string;
        };
}

@Controller('ai')
export class AI_Controller {
        constructor(
                private readonly aiService: AI_Service,

                @InjectRepository(User)
                private readonly userRepo: Repository<User>,

                @InjectRepository(Camera)
                private readonly cameraRepo: Repository<Camera>,

                @InjectRepository(FaceProfile)
                private readonly faceProfileRepo: Repository<FaceProfile>,

                @InjectRepository(ActiveLog)
                private readonly activeLogRepo: Repository<ActiveLog>,

                @InjectRepository(FamilyMember)
                private readonly familyMemberRepo: Repository<FamilyMember>
        ) {}

        @Post('ask-safio')
        async askMintoBot(@Body('question') question: string, @Req() req: AuthenticatedRequest) {
                if (!question?.trim()) {
                        throw new BadRequestException('Câu hỏi không được để trống');
                }

                if (!req.user?.user_id) {
                        throw new UnauthorizedException('User chưa được xác thực');
                }

                const userId = req.user.user_id;

                // 1. Lấy thông tin user đầy đủ
                const user = await this.userRepo.findOne({
                        where: { id: userId },
                        relations: ['role', 'face_profile'],
                });

                if (!user) {
                        throw new BadRequestException('Không tìm thấy người dùng');
                }

                // 2. Tìm family_group_id của user (nếu có)
                const familyMember = await this.familyMemberRepo.findOne({
                        where: { user: { id: userId } },
                        relations: ['familyGroup'],
                });

                const familyGroupId = familyMember?.familyGroup?.id;

                // 3. Lấy danh sách camera của gia đình
                let cameras: any[] = [];
                if (familyGroupId) {
                        cameras = await this.cameraRepo.find({
                                where: { familyGroup: { id: familyGroupId } },
                                relations: ['createdBy'],
                                order: { createdAt: 'DESC' },
                        });
                } else {
                        // fallback: camera do chính user tạo
                        cameras = await this.cameraRepo.find({
                                where: { createdBy: { id: userId } },
                                relations: ['createdBy'],
                                order: { createdAt: 'DESC' },
                        });
                }

                // 4. Lấy Face Profile
                const faceProfile = await this.faceProfileRepo.findOne({
                        where: { user_id: userId },
                        relations: ['embeddings'],
                });

                // 5. Lấy thống kê té ngã (ActiveLog có fall_type hoặc warningType)
                const fallLogs = await this.activeLogRepo
                        .createQueryBuilder('log')
                        .leftJoinAndSelect('log.warningType', 'wt')
                        .leftJoinAndSelect('log.camera', 'cam')
                        .where('log.user_id = :userId', { userId })
                        .andWhere('(log.fall_type IS NOT NULL OR log.warning_type_id IS NOT NULL)')
                        .orderBy('log.created_at', 'DESC')
                        .getMany();

                // Map level (tùy theo cách bạn lưu level trong WarningType)
                const level1 = fallLogs.filter(
                        (l) =>
                                l.warningType?.level?.toLowerCase() === 'low' ||
                                l.warningType?.level === '1'
                ).length;
                const level2 = fallLogs.filter(
                        (l) =>
                                l.warningType?.level?.toLowerCase() === 'medium' ||
                                l.warningType?.level === '2'
                ).length;
                const level3 = fallLogs.filter(
                        (l) =>
                                l.warningType?.level?.toLowerCase() === 'high' ||
                                l.warningType?.level?.toLowerCase() === 'critical' ||
                                l.warningType?.level === '3'
                ).length;

                // 6. Xây dựng context đầy đủ
                const context: SafioAIContext = {
                        userInfo: {
                                full_name: user.full_name,
                                email: user.email,
                                phone_number: user.phone_number,
                                date_of_birth: user.date_of_birth,
                                require_face_id: user.require_face_id,
                                role: user.role?.name,
                                createdAt: user.createdAt,
                        },

                        cameras: cameras.map((cam) => ({
                                id: cam.id,
                                cam_name: cam.cam_name,
                                location: cam.location,
                                camera_type: cam.camera_type,
                                status: cam.status,
                                createdAt: cam.createdAt,
                                createdByName: cam.createdBy?.full_name,
                                createdById: cam.createdBy?.id,
                        })),

                        faceProfile: faceProfile
                                ? {
                                          status: faceProfile.status,
                                          registered_at: faceProfile.registered_at,
                                          hasEmbeddings: (faceProfile.embeddings?.length || 0) > 0,
                                  }
                                : undefined,

                        fallStats: {
                                total: fallLogs.length,
                                level1,
                                level2,
                                level3,
                                latest: fallLogs[0]
                                        ? {
                                                  createdAt:
                                                          fallLogs[0].createdAt ||
                                                          fallLogs[0].created,
                                                  cameraName: fallLogs[0].camera?.cam_name,
                                                  level: fallLogs[0].warningType?.level,
                                                  snapshot_url: fallLogs[0].snapshot_url,
                                          }
                                        : undefined,
                        },
                };

                // 7. Gọi AI
                const response = await this.aiService.answerAsSafioAI(
                        userId,
                        question,
                        context,
                        // Nếu bạn đã lưu conversationHistory thì truyền vào đây
                        // hiện tại để mảng rỗng
                        []
                );

                return {
                        response,
                };
        }

        @Post('end-session')
        async endSession(@Req() req: AuthenticatedRequest) {
                if (req.user?.user_id) {
                        await this.aiService.endChatSession(req.user.user_id);
                }

                return {
                        success: true,
                };
        }
}
