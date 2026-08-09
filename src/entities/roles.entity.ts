import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('roles')
export class Role {
        @PrimaryGeneratedColumn('uuid')
        id: string;

        @Column({ unique: true })
        name: string;
}
