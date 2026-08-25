import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { ActiveLog } from './active_logs.entity';
import { User } from './users.entity';

@Entity('notifications')
export class Notification {
        @PrimaryGeneratedColumn('uuid')
        id: string;

        @ManyToOne(() => ActiveLog, {
                nullable: false,
                onDelete: 'CASCADE',
        })
        @JoinColumn({
                name: 'log_id',
        })
        activeLog: ActiveLog;

        @ManyToOne(() => User, {
                nullable: false,
                onDelete: 'CASCADE',
        })
        @JoinColumn({
                name: 'recipient_user_id',
        })
        recipientUser: User;

        @Column({
                default: () => 'CURRENT_TIMESTAMP',
        })
        sent_at: Date;

        @Column({
                type: 'enum',
                enum: ['sent', 'delivered', 'read', 'failed'],
                default: 'sent',
        })
        status: string;
}
