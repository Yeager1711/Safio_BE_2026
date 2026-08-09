import {
        Entity,
        PrimaryGeneratedColumn,
        Column,
        ManyToOne,
        JoinColumn,
        Unique,
        CreateDateColumn,
        UpdateDateColumn,
} from 'typeorm';

import { User } from './users.entity';

@Entity('relatives')
@Unique(['user', 'relativeUser'])
export class Relative {
        @PrimaryGeneratedColumn('uuid')
        id: string;

        @ManyToOne(() => User, { nullable: false })
        @JoinColumn({ name: 'user_id' })
        user: User;

        @ManyToOne(() => User, { nullable: false })
        @JoinColumn({ name: 'relative_user_id' })
        relativeUser: User;

        @Column({
                type: 'enum',
                enum: ['pending', 'accepted', 'denied'],
                default: 'pending',
        })
        acceptance_status: 'pending' | 'accepted' | 'denied';

        @Column({
                default: 'Người thân',
                nullable: true,
        })
        relationship?: string;

        @CreateDateColumn({
                name: 'created_at',
        })
        createdAt: Date;

        @UpdateDateColumn({
                name: 'updated_at',
        })
        updatedAt: Date;
}
