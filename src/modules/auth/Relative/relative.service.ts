import {
        Injectable,
        NotFoundException,
        BadRequestException,
        ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Relative } from '../../../entities/relatives.entity';
import { FamilyGroup } from '../../../entities/family-group.entity';
import { FamilyMember } from '../../../entities/family-member.entity';
import { User } from '../../../entities/users.entity';

@Injectable()
export class RelativeService {
        constructor(
                @InjectRepository(Relative)
                private relativeRepository: Repository<Relative>,

                @InjectRepository(FamilyGroup)
                private familyGroupRepository: Repository<FamilyGroup>,

                @InjectRepository(FamilyMember)
                private familyMemberRepository: Repository<FamilyMember>,

                @InjectRepository(User)
                private userRepository: Repository<User>
        ) {}

        async sendInvite(
                senderId: string,
                data: { relative_user_id: string; relationship?: string }
        ) {
                const { relative_user_id, relationship = 'Người thân' } = data;

                if (!senderId || !relative_user_id) {
                        throw new BadRequestException('Thiếu thông tin user');
                }

                if (senderId === relative_user_id) {
                        throw new BadRequestException('Không thể mời chính mình');
                }

                // Kiểm tra cùng family group
                const [senderMember, receiverMember] = await Promise.all([
                        this.familyMemberRepository.findOne({
                                where: { user: { id: senderId } },
                                relations: ['familyGroup'],
                        }),
                        this.familyMemberRepository.findOne({
                                where: { user: { id: relative_user_id } },
                                relations: ['familyGroup'],
                        }),
                ]);

                if (senderMember && receiverMember) {
                        if (senderMember.familyGroup.id !== receiverMember.familyGroup.id) {
                                throw new ConflictException(
                                        'Người dùng và bạn đang thuộc 2 nhóm gia đình khác nhau'
                                );
                        }
                }

                // Kiểm tra lời mời cùng chiều
                const existingSame = await this.relativeRepository.findOne({
                        where: [{ user: { id: senderId }, relativeUser: { id: relative_user_id } }],
                });

                if (existingSame) {
                        if (existingSame.acceptance_status === 'accepted')
                                throw new ConflictException('Đã kết nối rồi');
                        if (existingSame.acceptance_status === 'pending')
                                throw new ConflictException('Đã gửi lời mời rồi');
                        if (existingSame.acceptance_status === 'denied')
                                throw new ConflictException('Lời mời trước đã bị từ chối');
                }

                // Kiểm tra lời mời ngược chiều
                const existingOpposite = await this.relativeRepository.findOne({
                        where: [{ user: { id: relative_user_id }, relativeUser: { id: senderId } }],
                });

                if (existingOpposite) {
                        throw new ConflictException('Đã tồn tại lời mời ngược chiều từ người này!');
                }

                // Tạo lời mời mới
                const invite = this.relativeRepository.create({
                        user: { id: senderId },
                        relativeUser: { id: relative_user_id },
                        acceptance_status: 'pending',
                        relationship: relationship.trim(),
                });

                const savedInvite = await this.relativeRepository.save(invite);

                // Lấy đầy đủ thông tin
                const populated = await this.relativeRepository.findOne({
                        where: { id: savedInvite.id },
                        relations: ['user', 'relativeUser'],
                        select: {
                                id: true,
                                acceptance_status: true,
                                relationship: true,
                                createdAt: true,
                                user: {
                                        id: true,
                                        full_name: true,
                                        email: true,
                                        phone_number: true,
                                },
                                relativeUser: {
                                        id: true,
                                        full_name: true,
                                        email: true,
                                        phone_number: true,
                                },
                        },
                });

                return {
                        message: 'Gửi lời mời thành công',
                        data: populated,
                };
        }

        async getMyFamilyRequests(userId: string) {
                const relations = await this.relativeRepository.find({
                        where: [{ user: { id: userId } }, { relativeUser: { id: userId } }],
                        relations: ['user', 'relativeUser'],
                        order: { createdAt: 'DESC' },
                });

                const mapped = relations.map((r) => {
                        const isSender = r.user.id === userId;

                        return {
                                _id: r.id,
                                user_id: {
                                        _id: r.user.id,
                                        full_name: r.user.full_name,
                                        email: r.user.email,
                                },
                                relative_user_id: {
                                        _id: r.relativeUser.id,
                                        full_name: r.relativeUser.full_name,
                                        email: r.relativeUser.email,
                                },
                                relationship: r.relationship ?? 'Người thân',
                                acceptance_status: r.acceptance_status,
                                is_sender: isSender,
                                createdAt: r.createdAt,
                                updatedAt: r.updatedAt,
                        };
                });

                return {
                        pending: mapped.filter((x) => x.acceptance_status === 'pending'),
                        accepted: mapped.filter((x) => x.acceptance_status === 'accepted'),
                        denied: mapped.filter((x) => x.acceptance_status === 'denied'),
                };
        }

        async acceptInvite(
                inviteId: string,
                receiverId: string,
                relationshipFromReceiver?: string
        ) {
                const invite = await this.relativeRepository.findOne({
                        where: {
                                id: inviteId,
                                relativeUser: { id: receiverId },
                                acceptance_status: 'pending',
                        },
                        relations: ['user', 'relativeUser'],
                });

                if (!invite) {
                        throw new NotFoundException('Lời mời không tồn tại hoặc đã được xử lý');
                }

                // Cập nhật trạng thái
                invite.acceptance_status = 'accepted';
                if (relationshipFromReceiver?.trim()) {
                        invite.relationship = relationshipFromReceiver.trim();
                }
                await this.relativeRepository.save(invite);

                const senderId = invite.user.id;
                const receiverIdStr = invite.relativeUser.id;

                // Xác định Family Group
                const [memberA, memberB] = await Promise.all([
                        this.familyMemberRepository.findOne({
                                where: { user: { id: senderId } },
                                relations: ['familyGroup'],
                        }),
                        this.familyMemberRepository.findOne({
                                where: { user: { id: receiverIdStr } },
                                relations: ['familyGroup'],
                        }),
                ]);

                let finalGroup: FamilyGroup;

                if (
                        memberA?.familyGroup &&
                        memberB?.familyGroup &&
                        memberA.familyGroup.id === memberB.familyGroup.id
                ) {
                        finalGroup = memberA.familyGroup;
                } else if (memberA?.familyGroup) {
                        finalGroup = memberA.familyGroup;
                } else if (memberB?.familyGroup) {
                        finalGroup = memberB.familyGroup;
                } else {
                        finalGroup = await this.familyGroupRepository.save(new FamilyGroup());
                }

                const relationshipForSender = invite.relationship || 'Người thân';
                const relationshipForReceiver =
                        relationshipFromReceiver?.trim() || invite.relationship || 'Người thân';

                // Cập nhật hoặc tạo FamilyMember cho người gửi
                if (memberA) {
                        memberA.familyGroup = finalGroup;
                        memberA.relationship = relationshipForSender;

                        await this.familyMemberRepository.save(memberA);
                } else {
                        await this.familyMemberRepository.save({
                                user: { id: senderId },
                                familyGroup: finalGroup,
                                relationship: relationshipForSender,
                        });
                }

                // Cập nhật hoặc tạo FamilyMember cho người nhận
                if (memberB) {
                        memberB.familyGroup = finalGroup;
                        memberB.relationship = relationshipForReceiver;

                        await this.familyMemberRepository.save(memberB);
                } else {
                        await this.familyMemberRepository.save({
                                user: { id: receiverIdStr },
                                familyGroup: finalGroup,
                                relationship: relationshipForReceiver,
                        });
                }

                return {
                        message: 'Chấp nhận lời mời thành công!',
                        data: invite,
                        family_group_id: finalGroup.id,
                };
        }

        async getFamilyMembers(userId: string) {
                const member = await this.familyMemberRepository.findOne({
                        where: { user: { id: userId } },
                        relations: ['familyGroup'],
                });

                if (!member?.familyGroup) {
                        return {
                                message: 'Bạn chưa thuộc gia đình nào',
                                members: [],
                                family_group_id: null,
                        };
                }

                const members = await this.familyMemberRepository.find({
                        where: { familyGroup: { id: member.familyGroup.id } },
                        relations: ['user'],
                        order: { id: 'ASC' },
                });

                return {
                        family_group_id: member.familyGroup.id,
                        total_members: members.length,
                        members: members.map((m) => ({
                                userId: m.user.id,
                                full_name: m.user.full_name,
                                email: m.user.email,
                                phone_number: m.user.phone_number,
                                date_of_birth: m.user.date_of_birth,
                                relationship: m.relationship ?? 'Người thân',
                                is_me: m.user.id === userId,
                        })),
                };
        }

        async denyInvite(inviteId: string, receiverId: string) {
                const invite = await this.relativeRepository.findOne({
                        where: {
                                id: inviteId,
                                relativeUser: { id: receiverId },
                                acceptance_status: 'pending',
                        },
                        relations: ['user', 'relativeUser'],
                });

                if (!invite) throw new NotFoundException('Không tìm thấy lời mời');

                invite.acceptance_status = 'denied';
                await this.relativeRepository.save(invite);

                return { message: 'Đã từ chối lời mời', data: invite };
        }

        async getPendingInvites(userId: string) {
                const invites = await this.relativeRepository.find({
                        where: {
                                relativeUser: { id: userId },
                                acceptance_status: 'pending',
                        },
                        relations: ['user'],
                        order: { createdAt: 'DESC' },
                });

                return invites.map((i) => ({
                        invite_id: i.id,
                        from_user: {
                                userId: i.user.id,
                                full_name: i.user.full_name,
                                email: i.user.email,
                                phone_number: i.user.phone_number ?? null,
                        },
                        suggested_relationship: i.relationship,
                        sent_at: i.createdAt,
                }));
        }
}
