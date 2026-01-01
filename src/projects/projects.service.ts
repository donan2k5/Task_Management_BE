import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Project, ProjectDocument } from './schemas/project.schema';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { TasksService } from '../tasks/tasks.service';

const DASHBOARD_PROJECTS_LIMIT = 3;

@Injectable()
export class ProjectsService {
  constructor(
    @InjectModel(Project.name) private projectModel: Model<ProjectDocument>,
    private tasksService: TasksService,
  ) {}

  async create(
    userId: string,
    createProjectDto: CreateProjectDto,
  ): Promise<Project> {
    const createdProject = new this.projectModel({
      ...createProjectDto,
      userId,
    });
    return createdProject.save();
  }

  async findAll(userId: string): Promise<any[]> {
    const projects = await this.projectModel.find({ userId }).exec();

    const projectsWithStats = await Promise.all(
      projects.map(async (project) => {
        const tasks = await this.tasksService.findByProject(
          userId,
          project.name,
        );

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

  async findOne(userId: string, id: string): Promise<Project> {
    const project = await this.projectModel.findById(id).exec();
    if (!project) throw new NotFoundException(`Project ${id} not found`);

    // Verify ownership
    if (project.userId.toString() !== userId) {
      throw new ForbiddenException('You do not have access to this project');
    }

    return project;
  }

  async update(
    userId: string,
    id: string,
    updateProjectDto: UpdateProjectDto,
  ): Promise<Project> {
    const project = await this.projectModel.findById(id).exec();
    if (!project) throw new NotFoundException(`Project ${id} not found`);

    // Verify ownership
    if (project.userId.toString() !== userId) {
      throw new ForbiddenException('You do not have access to this project');
    }

    const updated = await this.projectModel
      .findByIdAndUpdate(id, updateProjectDto, { new: true })
      .exec();

    return updated!;
  }

  async remove(userId: string, id: string): Promise<Project> {
    const project = await this.projectModel.findById(id).exec();
    if (!project) throw new NotFoundException(`Project ${id} not found`);

    // Verify ownership
    if (project.userId.toString() !== userId) {
      throw new ForbiddenException('You do not have access to this project');
    }

    const deleted = await this.projectModel.findByIdAndDelete(id).exec();
    return deleted!;
  }

  async getStats(userId: string) {
    return {
      totalProjects: await this.projectModel.countDocuments({ userId }),
    };
  }

  async findDashboardProjects(userId: string) {
    return this.projectModel
      .find({ userId, status: 'active' })
      .limit(DASHBOARD_PROJECTS_LIMIT)
      .lean();
  }

  // Internal method for sync service
  async findByIdInternal(id: string): Promise<ProjectDocument | null> {
    return this.projectModel.findById(id).exec();
  }
}
