const express = require("express")
const cors = require("cors")
const fs = require("fs")
const nodemailer = require("nodemailer")

const app = express()
app.use(cors())
app.use(express.json({ limit: "10mb" }))

const adminFile = "./admin.json"
const dataFolder = "./data"
const EMAIL_USER = "avcharshiv9@gmail.com"
const EMAIL_PASS = "xdhk wgfo upkl ppgr"

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS
  }
})

if (!fs.existsSync(adminFile)) fs.writeFileSync(adminFile, "[]")
if (!fs.existsSync(dataFolder)) fs.mkdirSync(dataFolder)

const getToday = () => new Date().toISOString().split("T")[0]

function getStudentFile(username) {
  return `${dataFolder}/${username}_students.json`
}

function getAttendanceFile(username) {
  return `${dataFolder}/${username}_attendance.json`
}

function getLectureFile(username) {
  return `${dataFolder}/${username}_lectures.json`
}

function getDayStatusFile(username) {
  return `${dataFolder}/${username}_day_status.json`
}

function ensureSchoolFiles(username) {
  if (!fs.existsSync(getStudentFile(username))) fs.writeFileSync(getStudentFile(username), "[]")
  if (!fs.existsSync(getAttendanceFile(username))) fs.writeFileSync(getAttendanceFile(username), "[]")
  if (!fs.existsSync(getLectureFile(username))) fs.writeFileSync(getLectureFile(username), "[]")
  if (!fs.existsSync(getDayStatusFile(username))) fs.writeFileSync(getDayStatusFile(username), "[]")
}

function distance(d1, d2) {
  let sum = 0
  for (let i = 0; i < d1.length; i++) {
    sum += Math.pow(d1[i] - d2[i], 2)
  }
  return Math.sqrt(sum)
}

function calculateFinalDayAttendance(username, date) {
  ensureSchoolFiles(username)

  const students = JSON.parse(fs.readFileSync(getStudentFile(username)))
  const attendance = JSON.parse(fs.readFileSync(getAttendanceFile(username)))
  const lectures = JSON.parse(fs.readFileSync(getLectureFile(username))).filter(l => l.date === date)

  if (lectures.length === 0) {
    return {
      total: students.length,
      present: 0,
      absent: students.length,
      lectures: 0
    }
  }

  const presentStudents = students.filter(student => {
    return lectures.every(lecture => {
      return attendance.find(a =>
        a.roll === student.roll &&
        a.date === date &&
        a.lecture === lecture.name
      )
    })
  })

  return {
    total: students.length,
    present: presentStudents.length,
    absent: students.length - presentStudents.length,
    lectures: lectures.length
  }
}

function isDayCompleted(username, date) {
  ensureSchoolFiles(username)

  const dayStatus = JSON.parse(fs.readFileSync(getDayStatusFile(username)))
  return dayStatus.find(d => d.date === date && d.completed === true)
}

app.get("/", (req, res) => {
  res.send("Backend is running")
})

// ================= ADMIN REGISTER =================
app.post("/admin/register", (req, res) => {
  const { name, email, phone, username, password, confirmPassword, school } = req.body

  if (!name || !email || !phone || !username || !password || !confirmPassword || !school) {
    return res.json({ success: false, message: "All fields required" })
  }

  if (password !== confirmPassword) {
    return res.json({ success: false, message: "Passwords do not match" })
  }

  let admins = JSON.parse(fs.readFileSync(adminFile))

  if (admins.find(a => a.username === username)) {
    return res.json({ success: false, message: "Username already exists" })
  }

  const newAdmin = {
    username,
    password,
    name,
    email,
    phone,
    school,
    role: "Administrator"
  }

  admins.push(newAdmin)
  fs.writeFileSync(adminFile, JSON.stringify(admins, null, 2))

  ensureSchoolFiles(username)

  res.json({
    success: true,
    message: "Admin registered successfully",
    admin: newAdmin
  })
})

// ================= ADMIN LOGIN =================
app.post("/admin/login", (req, res) => {
  const { username, password } = req.body

  const admins = JSON.parse(fs.readFileSync(adminFile))
  const admin = admins.find(a => a.username === username && a.password === password)

  if (!admin) {
    return res.json({ success: false, message: "Invalid username or password" })
  }

  ensureSchoolFiles(username)

  res.json({
    success: true,
    message: "Login successful",
    admin
  })
})

// ================= ADMIN PROFILE =================
app.get("/admin/profile/:username", (req, res) => {
  const { username } = req.params
  const admins = JSON.parse(fs.readFileSync(adminFile))

  const admin = admins.find(a => a.username === username)

  if (!admin) {
    return res.json({ success: false, message: "Admin not found" })
  }

  res.json(admin)
})

app.post("/admin/update-profile", (req, res) => {
  const { username, name, email, phone } = req.body

  let admins = JSON.parse(fs.readFileSync(adminFile))
  const index = admins.findIndex(a => a.username === username)

  if (index === -1) {
    return res.json({ success: false, message: "Admin not found" })
  }

  admins[index].name = name || admins[index].name
  admins[index].email = email || admins[index].email
  admins[index].phone = phone || admins[index].phone

  fs.writeFileSync(adminFile, JSON.stringify(admins, null, 2))

  res.json({ success: true, message: "Profile updated successfully" })
})

app.post("/admin/change-password", (req, res) => {
  const { username, oldPassword, newPassword } = req.body

  let admins = JSON.parse(fs.readFileSync(adminFile))
  const index = admins.findIndex(a => a.username === username)

  if (index === -1) {
    return res.json({ success: false, message: "Admin not found" })
  }

  if (admins[index].password !== oldPassword) {
    return res.json({ success: false, message: "Old password is incorrect" })
  }

  admins[index].password = newPassword
  fs.writeFileSync(adminFile, JSON.stringify(admins, null, 2))

  res.json({ success: true, message: "Password changed successfully" })
})

// ================= STUDENT =================
app.post("/add-student", (req, res) => {
 const { name, roll, parentEmail, descriptor, username } = req.body

  if (!username) return res.json({ message: "Admin username missing" })
  if (!name || !roll || !descriptor) return res.json({ message: "All fields and face data required" })

  ensureSchoolFiles(username)

  const students = JSON.parse(fs.readFileSync(getStudentFile(username)))

  if (students.find(s => s.roll === roll)) {
    return res.json({ message: "Student already exists" })
  }

 students.push({
  name,
  roll,
  parentEmail,
  descriptor
})
  fs.writeFileSync(getStudentFile(username), JSON.stringify(students, null, 2))

  res.json({ message: "Student registered successfully" })
})

app.post("/students", (req, res) => {
  const { username } = req.body

  if (!username) return res.json([])

  ensureSchoolFiles(username)

  const students = JSON.parse(fs.readFileSync(getStudentFile(username)))
  res.json(students)
})

// ================= LECTURES =================
app.post("/lecture/add", (req, res) => {
  const { username, lecture, date } = req.body
  const selectedDate = date || getToday()

  if (!username || !lecture) {
    return res.json({ success: false, message: "Lecture name required" })
  }

  ensureSchoolFiles(username)

  const lectures = JSON.parse(fs.readFileSync(getLectureFile(username)))

  const exists = lectures.find(l => l.name === lecture && l.date === selectedDate)

  if (exists) {
    return res.json({ success: false, message: "Lecture already exists today" })
  }

  lectures.push({
    name: lecture,
    date: selectedDate,
    completed: false
  })

  fs.writeFileSync(getLectureFile(username), JSON.stringify(lectures, null, 2))

  res.json({ success: true, message: "Lecture added successfully" })
})

app.post("/lectures", (req, res) => {
  const { username, date } = req.body
  const selectedDate = date || getToday()

  if (!username) return res.json([])

  ensureSchoolFiles(username)

  const lectures = JSON.parse(fs.readFileSync(getLectureFile(username)))
    .filter(l => l.date === selectedDate)

  res.json(lectures)
})

app.post("/lecture/edit", (req, res) => {
  const { username, oldLecture, newLecture, date } = req.body
  const selectedDate = date || getToday()

  if (!username || !oldLecture || !newLecture) {
    return res.json({ success: false, message: "Lecture details required" })
  }

  ensureSchoolFiles(username)

  let lectures = JSON.parse(fs.readFileSync(getLectureFile(username)))
  let attendance = JSON.parse(fs.readFileSync(getAttendanceFile(username)))

  lectures = lectures.map(l => {
    if (l.name === oldLecture && l.date === selectedDate) {
      return { ...l, name: newLecture }
    }
    return l
  })

  attendance = attendance.map(a => {
    if (a.lecture === oldLecture && a.date === selectedDate) {
      return { ...a, lecture: newLecture }
    }
    return a
  })

  fs.writeFileSync(getLectureFile(username), JSON.stringify(lectures, null, 2))
  fs.writeFileSync(getAttendanceFile(username), JSON.stringify(attendance, null, 2))

  res.json({ success: true, message: "Lecture name updated successfully" })
})

async function sendAbsentEmail(parentEmail, studentName, roll, school, date) {
  if (!parentEmail) return

  const mailOptions = {
    from: EMAIL_USER,
    to: parentEmail,
    subject: "Attendance Alert - Student Absent",
    html: `
      <h2>Attendance Alert</h2>

      <p>Dear Parent,</p>

      <p>
        Your child <b>${studentName}</b> 
        (Roll No: <b>${roll}</b>) 
        was marked <b>Absent</b> on 
        <b>${date}</b> because they did not attend all lectures.
      </p>

      <p>Please ensure regular attendance.</p>

      <br>

      <p>
        Regards,<br>
        <b>${school}</b>
      </p>
    `
  }

  try {
    await transporter.sendMail(mailOptions)
    console.log("Email sent to:", parentEmail)
  } catch (err) {
    console.log("Email failed:", err.message)
  }
}

app.post("/complete-all-lectures", async (req, res) => {
  const { username, date } = req.body
  const selectedDate = date || getToday()

  if (!username) {
    return res.json({ success: false, message: "Admin username missing" })
  }

  ensureSchoolFiles(username)

  let dayStatus = JSON.parse(fs.readFileSync(getDayStatusFile(username)))

  const existing = dayStatus.find(d => d.date === selectedDate)

  if (existing) {
    existing.completed = true
  } else {
    dayStatus.push({
      date: selectedDate,
      completed: true
    })
  }

  fs.writeFileSync(getDayStatusFile(username), JSON.stringify(dayStatus, null, 2))

  const admins = JSON.parse(fs.readFileSync(adminFile))
  const admin = admins.find(a => a.username === username)

  const students = JSON.parse(fs.readFileSync(getStudentFile(username)))
  const attendance = JSON.parse(fs.readFileSync(getAttendanceFile(username)))
  const lectures = JSON.parse(fs.readFileSync(getLectureFile(username))).filter(l => l.date === selectedDate)

  let emailCount = 0

  for (const student of students) {
    const attendedAllLectures =
      lectures.length > 0 &&
      lectures.every(lecture =>
        attendance.find(a =>
          a.roll === student.roll &&
          a.date === selectedDate &&
          a.lecture === lecture.name
        )
      )

    if (!attendedAllLectures && student.parentEmail) {
      await sendAbsentEmail(
        student.parentEmail,
        student.name,
        student.roll,
        admin?.school || "School",
        selectedDate
      )

      emailCount++
    }
  }

  const finalData = calculateFinalDayAttendance(username, selectedDate)

  res.json({
    success: true,
    message: `All lectures completed. Final attendance updated. Emails sent: ${emailCount}`,
    ...finalData
  })
})

// ================= FACE RECOGNITION WITH LECTURE =================
app.post("/recognize", (req, res) => {
  const { descriptor, username, lecture } = req.body

  if (!username) {
    return res.json({ status: "unknown", message: "Admin username missing" })
  }

  if (!lecture) {
    return res.json({ status: "error", message: "Lecture name required" })
  }

  ensureSchoolFiles(username)

  const students = JSON.parse(fs.readFileSync(getStudentFile(username)))
  const attendance = JSON.parse(fs.readFileSync(getAttendanceFile(username)))

  let lectures = JSON.parse(fs.readFileSync(getLectureFile(username)))
  const today = getToday()

  const lectureExists = lectures.find(l => l.name === lecture && l.date === today)

  if (!lectureExists) {
    lectures.push({
      name: lecture,
      date: today,
      completed: false
    })
    fs.writeFileSync(getLectureFile(username), JSON.stringify(lectures, null, 2))
  }

  let bestMatch = null
  let bestDistance = 999

  students.forEach(student => {
    if (!student.descriptor) return

    const dist = distance(descriptor, student.descriptor)

    if (dist < bestDistance) {
      bestDistance = dist
      bestMatch = student
    }
  })

  if (!bestMatch || bestDistance > 0.6) {
    return res.json({ status: "unknown", message: "Unknown face" })
  }

  if (attendance.find(a => a.roll === bestMatch.roll && a.date === today && a.lecture === lecture)) {
    return res.json({
      status: "already",
      name: bestMatch.name,
      roll: bestMatch.roll,
      lecture,
      message: "Already marked for this lecture"
    })
  }

  attendance.push({
    roll: bestMatch.roll,
    name: bestMatch.name,
    date: today,
    lecture,
    time: new Date().toLocaleTimeString(),
    status: "present"
  })

  fs.writeFileSync(getAttendanceFile(username), JSON.stringify(attendance, null, 2))

  res.json({
    status: "marked",
    name: bestMatch.name,
    roll: bestMatch.roll,
    lecture,
    message: "Attendance marked successfully"
  })
})

// ================= DASHBOARD =================
app.post("/dashboard", (req, res) => {
  const { username } = req.body
  const today = getToday()

  if (!username) {
    return res.json({
      total: 0,
      present: 0,
      absent: 0,
      completed: false,
      message: "Admin username missing"
    })
  }

  ensureSchoolFiles(username)

  const students = JSON.parse(fs.readFileSync(getStudentFile(username)))
  const completed = isDayCompleted(username, today)

  if (!completed) {
    return res.json({
      total: students.length,
      present: 0,
      absent: 0,
      completed: false,
      message: "Attendance will update after all lectures are completed"
    })
  }

  const finalData = calculateFinalDayAttendance(username, today)

  res.json({
    ...finalData,
    completed: true,
    message: "Final attendance updated"
  })
})

// ================= LECTURE-WISE BAR GRAPH =================
app.post("/lecture-graph", (req, res) => {
  const { username, date } = req.body
  const selectedDate = date || getToday()

  if (!username) return res.json([])

  ensureSchoolFiles(username)

  const students = JSON.parse(fs.readFileSync(getStudentFile(username)))
  const attendance = JSON.parse(fs.readFileSync(getAttendanceFile(username)))
  const lectures = JSON.parse(fs.readFileSync(getLectureFile(username))).filter(l => l.date === selectedDate)

  const result = lectures.map(lecture => {
    const present = attendance.filter(a => a.date === selectedDate && a.lecture === lecture.name).length

    return {
      lecture: lecture.name,
      present,
      absent: students.length - present
    }
  })

  res.json(result)
})

// ================= PIE CHART DAILY / WEEKLY / MONTHLY =================
app.post("/pie-analytics/:type", (req, res) => {
  const { username } = req.body
  const type = req.params.type

  if (!username) {
    return res.json({ present: 0, absent: 0, completed: false })
  }

  ensureSchoolFiles(username)

  const students = JSON.parse(fs.readFileSync(getStudentFile(username)))
  const dayStatus = JSON.parse(fs.readFileSync(getDayStatusFile(username)))
  const today = new Date()

  let dates = []

  if (type === "daily") {
    dates = [getToday()]
  }

  if (type === "weekly") {
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      dates.push(d.toISOString().split("T")[0])
    }
  }

  if (type === "monthly") {
    const year = today.getFullYear()
    const month = today.getMonth()

    const totalDays = new Date(year, month + 1, 0).getDate()

    for (let i = 1; i <= totalDays; i++) {
      const d = new Date(year, month, i)
      dates.push(d.toISOString().split("T")[0])
    }
  }

  let totalPresent = 0
  let totalAbsent = 0
  let completedDays = 0

  dates.forEach(date => {
    const completed = dayStatus.find(d => d.date === date && d.completed)

    if (completed) {
      const result = calculateFinalDayAttendance(username, date)
      totalPresent += result.present
      totalAbsent += result.absent
      completedDays++
    }
  })

  res.json({
    present: totalPresent,
    absent: totalAbsent,
    completedDays,
    totalStudents: students.length
  })
})

// ================= REPORT =================
// ================= REPORT =================
app.post("/report", (req, res) => {
  const { username } = req.body

  if (!username) return res.json([])

  ensureSchoolFiles(username)

  const students = JSON.parse(fs.readFileSync(getStudentFile(username)))
  const attendance = JSON.parse(fs.readFileSync(getAttendanceFile(username)))
  const lectures = JSON.parse(fs.readFileSync(getLectureFile(username)))
  const dayStatus = JSON.parse(fs.readFileSync(getDayStatusFile(username)))

  const fixedTotalDays = 26

  const completedDates = dayStatus
    .filter(d => d.completed)
    .map(d => d.date)

  const report = students.map(student => {
    let presentDays = 0

    completedDates.forEach(date => {
      const dayLectures = lectures.filter(l => l.date === date)

      const attendedAllLectures =
        dayLectures.length > 0 &&
        dayLectures.every(lecture =>
          attendance.find(a =>
            a.roll === student.roll &&
            a.date === date &&
            a.lecture === lecture.name
          )
        )

      if (attendedAllLectures) presentDays++
    })

    const percentage = Math.round((presentDays / fixedTotalDays) * 100)

    return {
      name: student.name,
      roll: student.roll,
      presentDays,
      totalDays: fixedTotalDays,
      percentage,
      warning: percentage < 75 ? "Low Attendance" : "Good"
    }
  })

  res.json(report)
})

// ================= DAILY REPORT =================
app.post("/daily-report/:date", (req, res) => {
  const { username } = req.body
  const date = req.params.date

  if (!username) return res.json([])

  ensureSchoolFiles(username)

  const students = JSON.parse(fs.readFileSync(getStudentFile(username)))
  const lectures = JSON.parse(fs.readFileSync(getLectureFile(username))).filter(l => l.date === date)
  const attendance = JSON.parse(fs.readFileSync(getAttendanceFile(username)))

  const report = students.map(student => {
    const attendedAllLectures = lectures.length > 0 && lectures.every(lecture =>
      attendance.find(a => a.roll === student.roll && a.date === date && a.lecture === lecture.name)
    )

    return {
      roll: student.roll,
      name: student.name,
      date,
      status: attendedAllLectures ? "Present" : "Absent",
      time: "-"
    }
  })

  res.json(report)
})

// ================= RESET SYSTEM =================
app.post("/reset-system", (req, res) => {
  const { username } = req.body

  if (!username) {
    return res.json({ message: "Admin username missing" })
  }

  ensureSchoolFiles(username)

  fs.writeFileSync(getStudentFile(username), "[]")
  fs.writeFileSync(getAttendanceFile(username), "[]")
  fs.writeFileSync(getLectureFile(username), "[]")
  fs.writeFileSync(getDayStatusFile(username), "[]")

  res.json({ message: "School data reset successfully" })
})

//
// ================= STUDENT PROFILE =================
// ================= STUDENT PROFILE =================
app.post("/student-profile", (req, res) => {
  const { username, roll } = req.body

  if (!username || !roll) {
    return res.json({ success: false, message: "Username and roll number required" })
  }

  ensureSchoolFiles(username)

  const students = JSON.parse(fs.readFileSync(getStudentFile(username)))
  const attendance = JSON.parse(fs.readFileSync(getAttendanceFile(username)))
  const lectures = JSON.parse(fs.readFileSync(getLectureFile(username)))
  const dayStatus = JSON.parse(fs.readFileSync(getDayStatusFile(username)))

  const student = students.find(s => s.roll === roll)

  if (!student) {
    return res.json({ success: false, message: "Student not found" })
  }

  const fixedTotalDays = 26

  const completedDates = dayStatus
    .filter(d => d.completed)
    .map(d => d.date)

  let presentDays = 0
  let history = []

  completedDates.forEach(date => {
    const dayLectures = lectures.filter(l => l.date === date)

    const attendedLectures = dayLectures.filter(lecture =>
      attendance.find(a =>
        a.roll === roll &&
        a.date === date &&
        a.lecture === lecture.name
      )
    )

    const isPresent =
      dayLectures.length > 0 &&
      attendedLectures.length === dayLectures.length

    if (isPresent) presentDays++

    history.push({
      date,
      status: isPresent ? "Present" : "Absent",
      totalLectures: dayLectures.length,
      attendedLectures: attendedLectures.length
    })
  })

  const absentDays = fixedTotalDays - presentDays
  const percentage = Math.round((presentDays / fixedTotalDays) * 100)

  res.json({
    success: true,
    name: student.name,
    roll: student.roll,
    presentDays,
    absentDays,
    totalDays: fixedTotalDays,
    percentage,
    history
  })
})
 // ================= SERVER =================
app.listen(5000, () => {
  console.log("Server running on http://localhost:5000")
})