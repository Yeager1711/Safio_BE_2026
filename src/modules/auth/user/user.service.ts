import {
        Injectable,
        NotFoundException,
        OnModuleInit,
        Logger,
        BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, ILike } from 'typeorm';
import { User } from '../../../entities/users.entity';
import { Role } from '../../../entities/roles.entity';
import { Relative } from '../../../entities/relatives.entity';
import { Camera } from '../../../entities/camera.entity';
import { ActiveLog } from '../../../entities/active_logs.entity';
import { Notification } from '../../../entities/notifications.entity';
import { FamilyMember } from '../../../entities/family-member.entity';
import { FamilyGroup } from '../../../entities/family-group.entity';
import { FaceProfile } from '../../../entities/face_profile.entity';
import { FaceEmbedding } from '../../../entities/face_embedding.entity';

@Injectable()
export class UserService implements OnModuleInit {
        private readonly logger = new Logger(UserService.name);
        private adminRoleId: string | null = null;

        constructor(
                @InjectRepository(User)
                private userRepository: Repository<User>,

                @InjectRepository(Role)
                private roleRepository: Repository<Role>,

                @InjectRepository(Relative)
                private relativeRepository: Repository<Relative>,

                @InjectRepository(Camera)
                private cameraRepository: Repository<Camera>,

                @InjectRepository(ActiveLog)
                private activeLogRepository: Repository<ActiveLog>,

                @InjectRepository(Notification)
                private notificationRepository: Repository<Notification>,

                @InjectRepository(FamilyMember)
                private familyMemberRepository: Repository<FamilyMember>,

                @InjectRepository(FamilyGroup)
                private familyGroupRepository: Repository<FamilyGroup>,

                @InjectRepository(FaceProfile)
                private faceProfileRepository: Repository<FaceProfile>,

                @InjectRepository(FaceEmbedding)
                private faceEmbeddingRepository: Repository<FaceEmbedding>
        ) {}

        // =============================
        // HELPER FUNCTIONS
        // =============================
        private calculateAge(date: Date): number {
                if (!date) return 0;
                const today = new Date();
                const birth = new Date(date);
                let age = today.getFullYear() - birth.getFullYear();
                const m = today.getMonth() - birth.getMonth();
                if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
                return age >= 0 ? age : 0;
        }

        private formatDate(date: Date): string {
                if (!date) return null;
                return new Date(date).toISOString().split('T')[0];
        }

        async onModuleInit() {
                await this.loadAdminRoleId();
        }

        private async loadAdminRoleId() {
                const adminRole = await this.roleRepository.findOne({
                        where: { name: 'admin' },
                        select: ['id'],
                });

                if (adminRole?.id) {
                        this.adminRoleId = adminRole.id;
                        this.logger.log(`Admin role cached: ${this.adminRoleId}`);
                }
        }

        // =============================
        // SEARCH USERS
        // =============================
        async searchUsers(query: string, page = 1, limit = 20) {
                if (!query?.trim()) throw new NotFoundException('Query cannot be empty');

                const skip = (page - 1) * limit;

                const qb = this.userRepository
                        .createQueryBuilder('user')
                        .leftJoinAndSelect('user.role', 'role')
                        .where('role.id != :adminRoleId', {
                                adminRoleId: this.adminRoleId,
                        })
                        .select([
                                'user.id',
                                'user.full_name',
                                'user.email',
                                'user.phone_number',
                                'user.date_of_birth',
                                'user.createdAt',
                                'role.name',
                        ]);

                // Tìm theo ID hoặc text
                if (query.length >= 2) {
                        qb.andWhere(
                                `
                                user.id LIKE :query
                                OR user.full_name LIKE :query
                                OR user.email LIKE :query
                                OR user.phone_number LIKE :query
                                `,
                                {
                                        query: `%${query}%`,
                                }
                        );
                }
                console.log(qb.getSql());
                console.log(qb.getParameters());
                const [users, total] = await qb
                        .skip(skip)
                        .take(limit)
                        .orderBy('user.createdAt', 'DESC')

                        .getManyAndCount();

                return {
                        data: users.map((u) => ({
                                userId: u.id,
                                full_name: u.full_name,
                                email: u.email,
                                phone_number: u.phone_number,
                                role: u.role?.name ?? 'customer',
                                age: this.calculateAge(u.date_of_birth),
                                date_of_birth: this.formatDate(u.date_of_birth),
                                createdAt: u.createdAt,
                        })),
                        pagination: {
                                page,
                                limit,
                                total,
                                totalPages: Math.ceil(total / limit),
                                hasNext: page < Math.ceil(total / limit),
                                hasPrev: page > 1,
                        },
                };
        }

        async getAllUsers() {
                const users = await this.userRepository.find({
                        relations: ['role'],
                        select: {
                                id: true,
                                full_name: true,
                                email: true,
                                phone_number: true,
                                date_of_birth: true,
                                createdAt: true,
                                role: { name: true },
                        },
                });

                return users.map((u) => ({
                        userId: u.id,
                        full_name: u.full_name,
                        email: u.email,
                        phone_number: u.phone_number,
                        role: u.role?.name ?? 'customer',
                        age: this.calculateAge(u.date_of_birth),
                        date_of_birth: this.formatDate(u.date_of_birth),
                        createdAt: u.createdAt,
                }));
        }

        // =============================
        // GET USER PROFILE (Logic phức tạp)
        // =============================
        async getUserProfile(userId: string) {
                const user = await this.userRepository.findOne({
                        where: { id: userId },

                        relations: ['role'],

                        select: {
                                id: true,
                                full_name: true,
                                email: true,
                                phone_number: true,
                                date_of_birth: true,

                                createdAt: true,
                                updatedAt: true,

                                require_face_id: true,

                                role: {
                                        name: true,
                                },
                        },
                });

                if (!user) throw new NotFoundException('User not found');

                let relatives: any[] = [];

                // Kiểm tra user có trong Family Group không
                const familyMember = await this.familyMemberRepository.findOne({
                        where: { user: { id: userId } },
                        relations: ['familyGroup'],
                });

                if (familyMember) {
                        // Lấy tất cả thành viên trong group
                        const groupMembers = await this.familyMemberRepository.find({
                                where: { familyGroup: { id: familyMember.familyGroup.id } },
                                relations: ['user'],
                        });

                        for (const member of groupMembers) {
                                if (member.user.id === userId) continue;

                                const relation = await this.relativeRepository.findOne({
                                        where: [
                                                {
                                                        user: { id: userId },
                                                        relativeUser: { id: member.user.id },
                                                },
                                                {
                                                        user: { id: member.user.id },
                                                        relativeUser: { id: userId },
                                                },
                                        ],
                                        select: {
                                                id: true,
                                                acceptance_status: true,
                                        },
                                });

                                relatives.push({
                                        user_id: member.user.id,
                                        full_name: member.user.full_name,
                                        email: member.user.email,
                                        phone_number: member.user.phone_number,
                                        relationship: member.relationship ?? 'Người thân',
                                        date_of_birth: member.user.date_of_birth,
                                        group_id: familyMember.familyGroup.id,
                                        source: 'family_group',
                                        acceptance_status:
                                                relation?.acceptance_status ?? 'accepted',
                                });
                        }
                } else {
                        // Lấy từ Relative table
                        const relativeRecords = await this.relativeRepository.find({
                                where: [{ user: { id: userId } }, { relativeUser: { id: userId } }],
                                relations: ['user', 'relativeUser'],
                        });

                        relatives = relativeRecords.map((rel) => {
                                const isRequester = rel.user.id === userId;
                                const target = isRequester ? rel.relativeUser : rel.user;

                                return {
                                        user_id: target.id,
                                        full_name: target.full_name,
                                        email: target.email,
                                        phone_number: target.phone_number,
                                        relationship: rel.relationship,
                                        date_of_birth: target.date_of_birth,
                                        acceptance_status: rel.acceptance_status,
                                        createdAt: rel.createdAt,
                                        source: 'relative',
                                };
                        });
                }

                // Cameras
                const cameras = await this.cameraRepository.find({
                        where: { createdBy: { id: userId } }, // Giả sử createdBy là người tạo camera
                        select: [
                                'id',
                                'cam_name',
                                'location',
                                'ip_address',
                                'status',
                                'camera_type',
                                'createdAt',
                        ],
                        order: { createdAt: 'DESC' },
                });

                // Activity Logs
                const logs = await this.activeLogRepository.find({
                        where: { user: { id: userId } },
                        relations: ['camera', 'warningType'],
                        order: { created: 'DESC' },
                });

                // Notifications
                const notifications = await this.notificationRepository.find({
                        where: {
                                /* cần điều chỉnh nếu có user_id */
                        },
                        relations: ['activeLog'],
                        order: { sent_at: 'DESC' },
                });

                return {
                        user: {
                                user_id: user.id,
                                full_name: user.full_name,
                                email: user.email,
                                phone_number: user.phone_number,
                                role: user.role?.name ?? 'customer',

                                age: this.calculateAge(user.date_of_birth),
                                date_of_birth: this.formatDate(user.date_of_birth),

                                created_at: user.createdAt,
                                updated_at: user.updatedAt,
                        },

                        verify_Auth: {
                                require_face_id: user.require_face_id,
                        },

                        relatives,
                        cameras,
                        // activity_logs: logs,
                        // notifications,
                };
        }

        /**
         * Kiểm tra user đã có Face Profile + Embedding chưa
         */
        async getFaceIdStatus(userId: string) {
                const user = await this.userRepository.findOne({
                        where: { id: userId },
                        select: ['id', 'require_face_id'],
                });

                if (!user) {
                        throw new NotFoundException('User not found');
                }

                // tinyint(1) → boolean rõ ràng
                const requireFaceId = Boolean(Number(user.require_face_id));

                const faceProfile = await this.faceProfileRepository.findOne({
                        where: { user_id: userId },
                        relations: ['embeddings'],
                });

                const hasFaceProfile = !!faceProfile;
                const embeddingCount = faceProfile?.embeddings?.length ?? 0;
                const hasEmbeddings = embeddingCount > 0;

                const isReady =
                        hasFaceProfile &&
                        (faceProfile.status === 'registered' || faceProfile.status === 'active');

                return {
                        require_face_id: requireFaceId,
                        has_face_profile: hasFaceProfile,
                        has_embeddings: hasEmbeddings,
                        embedding_count: embeddingCount,
                        face_status: faceProfile?.status ?? null,
                        registered_at: faceProfile?.registered_at ?? null,
                        is_ready: isReady,
                };
        }

        async updateRequireFaceId(userId: string, requireFaceId: boolean) {
                const user = await this.userRepository.findOne({
                        where: { id: userId },
                        select: ['id', 'require_face_id'],
                });

                if (!user) {
                        throw new NotFoundException('User not found');
                }

                if (requireFaceId === true) {
                        const status = await this.getFaceIdStatus(userId);
                        if (!status.is_ready) {
                                throw new BadRequestException(
                                        'Bạn chưa đăng ký khuôn mặt. Vui lòng thêm Face ID trước khi bật tính năng này.'
                                );
                        }
                }

                // Update rõ ràng
                const result = await this.userRepository.update(
                        { id: userId },
                        { require_face_id: requireFaceId }
                );

                console.log('Update result:', result); // debug

                // Re-fetch chắc chắn
                const updated = await this.userRepository.findOne({
                        where: { id: userId },
                        select: ['id', 'require_face_id'],
                });

                const finalValue = Boolean(Number(updated?.require_face_id));

                return {
                        require_face_id: finalValue,
                        message: finalValue
                                ? 'Đã bật yêu cầu xác thực Face ID'
                                : 'Đã tắt yêu cầu xác thực Face ID',
                };
        }
}
