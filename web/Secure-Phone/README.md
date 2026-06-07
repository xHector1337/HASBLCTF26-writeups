# HASBL CTF Writeup - Secure Phone

| Field | Details |
|-------|---------|
| **Challenge** | Secure Phone |
| **Difficulty** | Hard |
| **Author** | interr (Muhammed Efe Erdoğan) |
| **Hint** | Could certain numbers hold a hidden meaning? Is there any way to uncover them? |
| **Flag** | `HASBL{Sql_Wi7h_Numb3rs!}` |

---

## Solution

When we enter the website, we are greeted by a virtual phone interface. The main menu of the phone features a numeric keypad for entering the passcode, along with clear and confirm buttons. There are also two applications accessible without any passcode: DevLogs and Gallery.

---

## Finding The First Vulnerability: IDOR

When we first check the DevLogs application, we notice the id=1 parameter in the URL:

```
/app/devlogs?id=1
```

In this currently open conversation with ID 1, it displays "Access denied or conversation not found." This makes us suspect a potential IDOR (Insecure Direct Object Reference) vulnerability via the id parameter.

To test this, we try the classic id=0. After changing the URL parameter to id=0 and loading the conversation, the vulnerability works, and we are presented with a chat log between two developers. In this chat, they briefly mention that mapping combinations have been uploaded to the application, a path traversal vulnerability in the Gallery app hasn't been fixed yet, and the /config/mapping.txt file is still accessible.

---

## Finding The Second Vulnerability: Path Traversal

Using the information obtained from the DevLogs application, we look for where the path traversal vulnerability could be in the Gallery app, and it doesn't take long to find it. Looking at the URL structure

```
/app/gallery?file=photo1.jpg
```

it is highly likely that we can perform path traversal via the file parameter. When we modify the URL to

```
/app/gallery?file=../../config/mapping.txt
```

we see four numbers on the screen.

**Important Note:** These numbers are dynamically generated per user/instance. The numbers below are the ones generated for my specific instance; the exact same numbers **will not** work for you.

The four numbers displayed are: 9975, 6873, 8334, and 4024.

---

## Finding The Third Vulnerability: SQL Injection

We know that these four numbers represent a specific combination and serve a particular function. When we input these numbers into the passcode field, we trigger an SQL Error. Based on the errors received, we can map the values as follows:

- 9975: OR
- 6873: AND
- 8334: = (equals)

However, we do not receive any error for the fourth number, 4024. Even though it doesn't trigger an error, this number must have a specific meaning. Therefore, we can deduce that this combination corresponds to a value, most likely the number 1. That being said, to avoid risking the 4024 value, we can also directly use the actual digit 1 in our payloads—it works either way.

---

## Exploiting The SQL Injection

Perhaps the most challenging part of this challenge is constructing the correct payload because our options are highly restricted (OR, AND, =, and 1). While the absence of single quotes (') might seem like a major obstacle, we can still construct a logical payload like `1 OR 1 = 1 OR 1 = 1` using the available inputs.

When we replace these values with their corresponding special number combinations, we get:

```
4024 9975 4024 8334 4024 9975 4024 8334 4024
```

When we enter this sequence as the passcode, the flag successfully appears on the screen:

---

## Flag

```
HASBL{Sql_Wi7h_Numb3rs!}
```
