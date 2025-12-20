import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Project, ProjectDocument } from './schemas/project.schema';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { TasksService } from '../tasks/tasks.service'; // Import Task Service

const DASHBOARD_PROJECTS_LIMIT = 3;

@Injectable()
export class ProjectsService {
  constructor(
    @InjectModel(Project.name) private projectModel: Model<ProjectDocument>,
    private tasksService: TasksService, // Inject để lấy tasks
  ) {}

  async create(createProjectDto: CreateProjectDto): Promise<Project> {
    const createdProject = new this.projectModel(createProjectDto);
    return createdProject.save();
  }

  async findAll(): Promise<any[]> {
    const projects = await this.projectModel.find().exec();

    const projectsWithStats = await Promise.all(
      projects.map(async (project) => {
        const tasks = await this.tasksService.findByProject(project.name);

        const totalTasks = tasks.length;
        const completedTasks = tasks.filter((t) => t.completed).length;

        const progress =
          totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

        return {
          ...project.toObject(),
          tasksCount: totalTasks,
          progress: progress,
          teammates: project['teammates'] || 1,
        };
      }),
    );

    return projectsWithStats;
  }

  async findOne(id: string): Promise<Project> {
    const project = await this.projectModel.findById(id).exec();
    if (!project) throw new NotFoundException(`Project ${id} not found`);
    return project;
  }

  async update(
    id: string,
    updateProjectDto: UpdateProjectDto,
  ): Promise<Project> {
    const updated = await this.projectModel
      .findByIdAndUpdate(id, updateProjectDto, { new: true })
      .exec();
    if (!updated) throw new NotFoundException(`Project ${id} not found`);
    return updated;
  }

  async remove(id: string): Promise<Project> {
    const deleted = await this.projectModel.findByIdAndDelete(id).exec();
    if (!deleted) throw new NotFoundException(`Project ${id} not found`);
    return deleted;
  }

  async getStats() {
    return { totalProjects: await this.projectModel.countDocuments() };
  }

  async findDashboardProjects() {
    return this.projectModel
      .find({ status: 'active' })
      .limit(DASHBOARD_PROJECTS_LIMIT)
      .lean();
  }
}
