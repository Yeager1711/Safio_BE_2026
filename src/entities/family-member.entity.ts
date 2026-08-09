import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { FamilyGroup } from './family-group.entity';
import { User } from './users.entity';

@Entity('family_members')
@Unique(['user'])
export class FamilyMember {
        @PrimaryGeneratedColumn('uuid')
        id: string;

        @ManyToOne(() => FamilyGroup, { nullable: false })
        @JoinColumn({ name: 'family_group_id' })
        familyGroup: FamilyGroup;

        @ManyToOne(() => User, { nullable: false })
        @JoinColumn({ name: 'user_id' })
        user: User;

        @Column({ length: 50, default: 'Người thân', nullable: true })
        relationship?: string;
}
