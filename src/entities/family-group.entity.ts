import { Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('family_groups')
export class FamilyGroup {
        @PrimaryGeneratedColumn('uuid')
        id: string;
}
