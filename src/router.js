import { createRouter, createWebHashHistory } from 'vue-router'
import RoleSelect from './views/RoleSelect.vue'
import TeacherStudio from './views/TeacherStudio.vue'
import StudentHub from './views/StudentHub.vue'
import StudentTraining from './views/StudentTraining.vue'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'role-select', component: RoleSelect },
    { path: '/teacher', name: 'teacher-studio', component: TeacherStudio },
    { path: '/student', name: 'student-hub', component: StudentHub },
    { path: '/student/training/:sceneId', name: 'student-training', component: StudentTraining, props: true }
  ]
})
