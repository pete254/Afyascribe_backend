import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('icd10_codes')
@Index(['code'], { unique: true })
@Index(['usage_count', 'last_used_at'])
export class Icd10Code {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 10, unique: true })
  code: string;

  @Column({ length: 200 })
  short_description: string;

  @Column({ type: 'text', nullable: true })
  long_description: string;

  @Column({ length: 5, nullable: true })
  chapter_code: string;

  @Column({ length: 200, nullable: true })
  chapter_name: string;

  @Column({ length: 10, nullable: true })
  category_code: string;

  @Column({ length: 200, nullable: true })
  category_name: string;

  @Column({ default: true })
  billable: boolean;

  @Column({ type: 'int', default: 0 })
  usage_count: number;

  @Column({ type: 'timestamp', nullable: true })
  last_used_at: Date;

  @Column({ type: 'text', array: true, default: [] })
  search_terms: string[];

  @Column({ type: 'date', nullable: true })
  effective_date: Date;

  @Column({ default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}